"""Unlimited-OCR Inference Script for SageMaker

Baidu Unlimited-OCR (Deepseek-OCR-derived 3B vision-language model).
Hugging Face: baidu/Unlimited-OCR

Variants (selected via the `model` field, registered in MODEL_REGISTRY):
- gundam: base_size=1024, image_size=640,  crop_mode=True  (single image, higher detail)
- base:   base_size=1024, image_size=1024, crop_mode=False (single image + multi-page/PDF)

This mirrors the structure of the PaddleOCR inference script
(packages/infra/model/code/inference.py): a BaseOCRModel ABC, a MODEL_REGISTRY,
and the SageMaker model_fn/input_fn/predict_fn/output_fn entry points. The output
schema is kept identical so the Lambda layer and frontend need no special-casing:
    {success, format, content, results, model, model_options, metadata}

The model is loaded once per container and shared across variants (same weights,
the variant only changes infer() sizing arguments).
"""
import os
import re
import json
import tempfile
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List

import boto3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Where the model weights live inside the container (baked in at build time).
MODEL_PATH = os.environ.get("UNLIMITED_OCR_MODEL_PATH", "/opt/ml/model/weights")
# Prompt that drives the document-parsing task (markdown-style output).
# (PDFs are split into per-page images and each page uses this same prompt.)
DEFAULT_PROMPT = "<image>document parsing."

# Lazily-initialised, shared across all variant instances in this container.
_shared_model = None
_shared_tokenizer = None

# Unlimited-OCR emits layout tags around recognised text, e.g.
#   <|det|>text [65, 94, 391, 116]<|/det|>실제 텍스트
#   <|ref|>실제 텍스트<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>
# Coordinates are normalised to a 0..999 grid (see modeling_unlimitedocr.py,
# which scales by `coord / 999 * image_dim`).
_REF_TAG_RE = re.compile(r"<\|ref\|>(.*?)<\|/ref\|>", re.DOTALL)
_DET_TAG_RE = re.compile(r"<\|det\|>.*?<\|/det\|>", re.DOTALL)
_STOP_STR = "<｜end▁of▁sentence｜>"

# Coordinate grid the model emits boxes on (0..999). We surface boxes on this
# same grid and report width/height = 999 so the frontend's
# scaleX = clientWidth / structData.width math lines up exactly — no need to
# know the real pixel size of the input image.
_COORD_GRID = 999

# A block: <|det|>label [x1, y1, x2, y2]<|/det|>content  (content follows the tag)
_DET_BLOCK_RE = re.compile(
    r"<\|det\|>\s*([A-Za-z_][\w-]*)\s*\[([^\]]+)\]\s*<\|/det\|>",
    re.DOTALL,
)
# A ref block: <|ref|>content<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>
_REF_BLOCK_RE = re.compile(
    r"<\|ref\|>(.*?)<\|/ref\|>\s*<\|det\|>\s*\[*([^\]]+)\]*\s*<\|/det\|>",
    re.DOTALL,
)


def _clean_infer_text(text: str) -> str:
    """Strip Unlimited-OCR layout markup, leaving readable document text."""
    if not text:
        return ""
    cleaned = text.replace(_STOP_STR, "")
    # <|ref|>content<|/ref|> -> content (text lives inside the ref tag)
    cleaned = _REF_TAG_RE.sub(r"\1", cleaned)
    # <|det|>label [coords]<|/det|> -> "" (coordinates only, no content)
    cleaned = _DET_TAG_RE.sub("", cleaned)
    return cleaned.strip()


def _parse_coords(raw: str) -> List[int]:
    """Parse '65, 94, 391, 116' (or nested) into [x1, y1, x2, y2] of ints."""
    nums = re.findall(r"-?\d+", raw)
    return [int(n) for n in nums[:4]]


def _parse_blocks(text: str) -> List[Dict[str, Any]]:
    """Parse Unlimited-OCR layout markup into PaddleOCR-style block dicts.

    Returns parsing_res_list entries:
        {block_label, block_content, block_bbox:[x1,y1,x2,y2], block_id,
         block_order, group_id}
    bbox is on the 0..999 grid (paired with width/height = 999 downstream).
    """
    if not text:
        return []
    cleaned = text.replace(_STOP_STR, "")
    blocks: List[Dict[str, Any]] = []

    # Form 1: <|det|>label [coords]<|/det|>content  — content is the text that
    # follows the closing tag, up to the next tag.
    for m in _DET_BLOCK_RE.finditer(cleaned):
        label = m.group(1).strip()
        coords = _parse_coords(m.group(2))
        if len(coords) != 4:
            continue
        # Content = text between this tag's end and the next "<|" marker.
        rest = cleaned[m.end():]
        nxt = rest.find("<|")
        content = (rest if nxt == -1 else rest[:nxt]).strip()
        blocks.append((m.start(), label, coords, content))

    # Form 2: <|ref|>content<|/ref|><|det|>[coords]<|/det|>  — content precedes.
    for m in _REF_BLOCK_RE.finditer(cleaned):
        content = m.group(1).strip()
        coords = _parse_coords(m.group(2))
        if len(coords) != 4:
            continue
        blocks.append((m.start(), "text", coords, content))

    # Order by position in the document, then build the final dicts.
    blocks.sort(key=lambda b: b[0])
    result: List[Dict[str, Any]] = []
    for idx, (_pos, label, coords, content) in enumerate(blocks):
        result.append(
            {
                "block_label": label,
                "block_content": content,
                "block_bbox": coords,
                "block_id": idx,
                "block_order": idx,
                "group_id": 0,
            }
        )
    return result


def _ensure_model_loaded():
    """Load the Unlimited-OCR model + tokenizer once per container."""
    global _shared_model, _shared_tokenizer
    if _shared_model is not None:
        return _shared_model, _shared_tokenizer

    logger.info("Loading Unlimited-OCR model from %s ...", MODEL_PATH)
    import torch
    from transformers import AutoModel, AutoTokenizer

    _shared_tokenizer = AutoTokenizer.from_pretrained(
        MODEL_PATH, trust_remote_code=True
    )
    _shared_model = AutoModel.from_pretrained(
        MODEL_PATH,
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
        use_safetensors=True,
    )
    _shared_model = _shared_model.eval().cuda()
    logger.info("Unlimited-OCR model loaded successfully")
    return _shared_model, _shared_tokenizer


# ============================================================================
# Base Model Class - mirrors packages/infra/model/code/inference.py
# ============================================================================
class BaseOCRModel(ABC):
    """Abstract base class for OCR models. Extend this to add new variants."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name identifier."""

    @abstractmethod
    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        """Run prediction on a single image, return a list of raw result strings."""

    def predict_multi(
        self, image_paths: List[str], options: Dict[str, Any] = None
    ) -> List[Any]:
        """Run prediction on multiple pages (PDF). Default: concatenate per-page."""
        results: List[Any] = []
        for p in image_paths:
            results.extend(self.predict(p, options))
        return results

    def format_output(
        self, results: List[Any], output_format: str = "markdown"
    ) -> Dict[str, Any]:
        """Format raw text results into the shared output schema.

        Unlimited-OCR returns parsed document text (markdown-style) with inline
        layout markup. We populate both:
          - `content`: markup stripped, for the markdown/document views.
          - `results`: one PaddleOCR-style page (parsing_res_list of blocks with
            0..999-grid bboxes) parsed from the markup, so the blocks view and
            bbox overlays work. width/height = 999 match that grid.
        Pages (one per raw result string) map to one results[] entry each.
        """
        content_parts: List[str] = []
        pages: List[Dict[str, Any]] = []
        page_count = len(results)
        for page_idx, raw in enumerate(results):
            if not raw:
                continue
            raw_str = str(raw)
            content_parts.append(_clean_infer_text(raw_str))
            pages.append(
                {
                    "input_path": "",
                    "page_index": page_idx,
                    "page_count": page_count,
                    "width": _COORD_GRID,
                    "height": _COORD_GRID,
                    "parsing_res_list": _parse_blocks(raw_str),
                }
            )

        content = "\n\n".join(p for p in content_parts if p).strip()
        return {
            "success": True,
            "format": output_format,
            "results": pages,
            "content": content,
        }


# ============================================================================
# Variant Implementations
# ============================================================================
class _UnlimitedOcrVariant(BaseOCRModel):
    """Shared implementation; subclasses only set the sizing preset."""

    _name = "base"
    _base_size = 1024
    _image_size = 1024
    _crop_mode = False

    @property
    def model_name(self) -> str:
        return self._name

    def _infer_kwargs(self) -> Dict[str, Any]:
        return {
            "base_size": self._base_size,
            "image_size": self._image_size,
            "crop_mode": self._crop_mode,
            "max_length": 32768,
            "no_repeat_ngram_size": 35,
            "ngram_window": 128,
            # eval_mode=True makes infer() RETURN the decoded text. Without it the
            # model only streams text to stdout and returns None (empty result).
            "eval_mode": True,
        }

    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        model, tokenizer = _ensure_model_loaded()
        with tempfile.TemporaryDirectory() as out_dir:
            text = model.infer(
                tokenizer,
                prompt=DEFAULT_PROMPT,
                image_file=image_path,
                output_path=out_dir,
                **self._infer_kwargs(),
            )
        return [text]

    # Multi-page handling lives in predict_fn: PDFs are rendered to per-page
    # images and each page goes through predict() above, so both variants
    # produce one results[] entry per page. (We intentionally don't use the
    # model's infer_multi(), which returns a single <PAGE>-delimited blob that
    # doesn't map cleanly to per-page blocks.)


class GundamModel(_UnlimitedOcrVariant):
    """High-detail single-image preset (crops the image)."""

    _name = "gundam"
    _base_size = 1024
    _image_size = 640
    _crop_mode = True


class BaseModel(_UnlimitedOcrVariant):
    """Default single-image / multi-page preset."""

    _name = "base"
    _base_size = 1024
    _image_size = 1024
    _crop_mode = False


# ============================================================================
# Model Registry - Add new variants here
# ============================================================================
MODEL_REGISTRY: Dict[str, type] = {
    "gundam": GundamModel,
    "base": BaseModel,
}

_model_cache: Dict[str, BaseOCRModel] = {}


def get_model(model_name: str) -> BaseOCRModel:
    """Get or create a variant instance from the registry."""
    if model_name not in MODEL_REGISTRY:
        available = ", ".join(MODEL_REGISTRY.keys())
        raise ValueError(f"Unknown model: {model_name}. Available: {available}")
    if model_name not in _model_cache:
        logger.info("Creating new instance of %s", model_name)
        _model_cache[model_name] = MODEL_REGISTRY[model_name]()
    return _model_cache[model_name]


# ============================================================================
# PDF handling
# ============================================================================
# Render PDFs at 2x (144 DPI) so small text stays legible to the model.
_PDF_RENDER_ZOOM = 2.0


def _is_pdf(path: str) -> bool:
    if path.lower().endswith(".pdf"):
        return True
    # Fall back to a magic-byte check (key may have no/odd extension).
    try:
        with open(path, "rb") as f:
            return f.read(5) == b"%PDF-"
    except OSError:
        return False


def _render_pdf_to_images(pdf_path: str, out_dir: str) -> List[str]:
    """Render each PDF page to a PNG and return the image paths in order."""
    import fitz  # PyMuPDF, installed in the container image

    image_paths: List[str] = []
    matrix = fitz.Matrix(_PDF_RENDER_ZOOM, _PDF_RENDER_ZOOM)
    with fitz.open(pdf_path) as doc:
        for page_idx in range(doc.page_count):
            page = doc.load_page(page_idx)
            pix = page.get_pixmap(matrix=matrix)
            img_path = os.path.join(out_dir, f"page_{page_idx:04d}.png")
            pix.save(img_path)
            image_paths.append(img_path)
    logger.info("Rendered %d page(s) from PDF", len(image_paths))
    return image_paths


# ============================================================================
# SageMaker Entry Points - mirrors the PaddleOCR inference script
# ============================================================================
s3_client = None


def model_fn(model_dir):
    """Initialize S3 client. The OCR model is loaded lazily on first use."""
    global s3_client
    logger.info("Initializing Unlimited-OCR service...")
    s3_client = boto3.client("s3")
    logger.info("Service initialized. Model will be loaded on demand.")
    return {"initialized": True}


def input_fn(request_body, content_type):
    """Parse input JSON."""
    if content_type == "application/json":
        return json.loads(request_body)
    raise ValueError(f"Unsupported content type: {content_type}")


def predict_fn(input_data, _):
    """Main prediction function with variant routing."""
    global s3_client

    s3_uri = input_data.get("s3_uri")
    output_key = input_data.get("output_key")
    model_name = input_data.get("model", "base")
    model_options = input_data.get("model_options", {})
    metadata = input_data.get("metadata", {})

    if not s3_uri:
        raise ValueError("s3_uri is required")

    logger.info("Processing with variant: %s, options: %s", model_name, model_options)

    # Parse S3 URI
    s3_uri_clean = s3_uri.replace("s3://", "")
    bucket = s3_uri_clean.split("/")[0]
    key = "/".join(s3_uri_clean.split("/")[1:])

    # Download the source file to a temp dir. PDFs are rendered to one image
    # per page; images are used as-is. Each page is run through predict() so
    # the result has one results[] entry per page (matching the frontend's
    # per-page navigation), for both gundam and base variants.
    suffix = os.path.splitext(key)[1] or ".jpg"
    work_dir = tempfile.mkdtemp()
    src_path = os.path.join(work_dir, f"source{suffix}")

    try:
        s3_client.download_file(bucket, key, src_path)

        if _is_pdf(src_path):
            page_paths = _render_pdf_to_images(src_path, work_dir)
            if not page_paths:
                raise ValueError("PDF has no renderable pages")
        else:
            page_paths = [src_path]

        ocr_model = get_model(model_name)
        # One raw result string per page.
        page_results: List[Any] = []
        for page_path in page_paths:
            page_results.extend(ocr_model.predict(page_path, model_options))

        output = ocr_model.format_output(page_results, output_format="markdown")
        output["model"] = model_name
        output["model_options"] = model_options
        output["metadata"] = metadata

        if output_key:
            s3_client.put_object(
                Bucket=bucket,
                Key=output_key,
                Body=json.dumps(output, ensure_ascii=False),
                ContentType="application/json",
            )
            logger.info("Result uploaded to s3://%s/%s", bucket, output_key)

        return output

    except Exception as e:
        logger.error("Prediction error: %s", str(e))
        error_output = {"success": False, "error": str(e), "model": model_name}
        if output_key:
            error_key = output_key.replace("result.json", "error.json")
            s3_client.put_object(
                Bucket=bucket,
                Key=error_key,
                Body=json.dumps(error_output, ensure_ascii=False),
                ContentType="application/json",
            )
        raise

    finally:
        import shutil

        shutil.rmtree(work_dir, ignore_errors=True)


def output_fn(prediction, accept):
    """Format output response."""
    return json.dumps(prediction, ensure_ascii=False)
