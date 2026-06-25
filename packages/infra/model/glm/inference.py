"""GLM-OCR Inference Script for SageMaker

Zhipu GLM-OCR (0.9B multimodal OCR: CogViT encoder + GLM-0.5B decoder).
Hugging Face: zai-org/GLM-OCR

Single variant `glm-ocr`. Uses the transformers AutoModelForImageTextToText
interface with the "Text Recognition:" document-parsing prompt. Output is
recognized document text (markdown-style); bounding boxes are not produced by
the raw model (layout/PP-DocLayout is a separate SDK step we don't run), so
`results` is left empty and only `content` is populated — the frontend's
content-only path renders this in the markdown view.

Mirrors packages/infra/model/unlimited/inference.py: BaseOCRModel ABC, a
MODEL_REGISTRY, and the SageMaker model_fn/input_fn/predict_fn/output_fn entry
points. Output schema is identical so the Lambda/frontend need no special case:
    {success, format, content, results, model, model_options, metadata}

PDFs are rendered to one image per page (PyMuPDF) and each page is run through
the model, producing one results[] entry per page (matches frontend per-page
navigation).
"""
import os
import json
import shutil
import tempfile
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List

import boto3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Where the model weights live inside the container (baked in at build time).
MODEL_PATH = os.environ.get("GLM_OCR_MODEL_PATH", "/opt/program/glm-ocr-weights")
# Document-parsing prompt per the model card. Other task strings the model
# supports: "Formula Recognition:", "Table Recognition:".
DEFAULT_PROMPT = "Text Recognition:"
# Per-page grid the frontend uses for empty results (no bbox here).
_COORD_GRID = 999

# Lazily-initialised, shared across the container.
_shared_model = None
_shared_processor = None


def _ensure_model_loaded():
    """Load the GLM-OCR model + processor once per container."""
    global _shared_model, _shared_processor
    if _shared_model is not None:
        return _shared_model, _shared_processor

    logger.info("Loading GLM-OCR model from %s ...", MODEL_PATH)
    import torch  # noqa: F401  (ensures torch is importable for device_map)
    from transformers import AutoProcessor, AutoModelForImageTextToText

    _shared_processor = AutoProcessor.from_pretrained(MODEL_PATH)
    _shared_model = AutoModelForImageTextToText.from_pretrained(
        pretrained_model_name_or_path=MODEL_PATH,
        torch_dtype="auto",
        device_map="auto",
    )
    logger.info("GLM-OCR model loaded successfully")
    return _shared_model, _shared_processor


# ============================================================================
# Base Model Class - mirrors packages/infra/model/code/inference.py
# ============================================================================
class BaseOCRModel(ABC):
    """Abstract base class for OCR models."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name identifier."""

    @abstractmethod
    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        """Run prediction on a single image, return a list of raw result strings."""

    def format_output(
        self, results: List[Any], output_format: str = "markdown"
    ) -> Dict[str, Any]:
        """Format raw text results into the shared output schema.

        GLM-OCR returns recognized text per page (no bbox). We populate
        `content` (joined pages) and emit one empty-block page per result so
        the frontend's per-page navigation and content-only rendering work.
        """
        content_parts: List[str] = []
        pages: List[Dict[str, Any]] = []
        page_count = len(results)
        for page_idx, raw in enumerate(results):
            if raw is None:
                continue
            text = str(raw).strip()
            content_parts.append(text)
            pages.append(
                {
                    "input_path": "",
                    "page_index": page_idx,
                    "page_count": page_count,
                    "width": _COORD_GRID,
                    "height": _COORD_GRID,
                    "parsing_res_list": [],
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
# Variant Implementation
# ============================================================================
class GlmOcrModel(BaseOCRModel):
    """GLM-OCR document text recognition."""

    _name = "glm-ocr"

    @property
    def model_name(self) -> str:
        return self._name

    def predict(self, image_path: str, options: Dict[str, Any] = None) -> List[Any]:
        model, processor = _ensure_model_loaded()
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "url": image_path},
                    {"type": "text", "text": DEFAULT_PROMPT},
                ],
            }
        ]
        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        ).to(model.device)
        # GLM-OCR generate path doesn't use token_type_ids.
        inputs.pop("token_type_ids", None)
        generated_ids = model.generate(**inputs, max_new_tokens=8192)
        trimmed = generated_ids[0][inputs["input_ids"].shape[1]:]
        text = processor.decode(trimmed, skip_special_tokens=True)
        return [text]


# ============================================================================
# Model Registry
# ============================================================================
MODEL_REGISTRY: Dict[str, type] = {
    "glm-ocr": GlmOcrModel,
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
# SageMaker Entry Points
# ============================================================================
s3_client = None


def model_fn(model_dir):
    """Initialize S3 client. The OCR model is loaded lazily on first use."""
    global s3_client
    logger.info("Initializing GLM-OCR service...")
    s3_client = boto3.client("s3")
    logger.info("Service initialized. Model will be loaded on demand.")
    return {"initialized": True}


def input_fn(request_body, content_type):
    """Parse input JSON."""
    if content_type == "application/json":
        return json.loads(request_body)
    raise ValueError(f"Unsupported content type: {content_type}")


def predict_fn(input_data, _):
    """Main prediction function. PDFs are split to per-page images."""
    global s3_client

    s3_uri = input_data.get("s3_uri")
    output_key = input_data.get("output_key")
    model_name = input_data.get("model", "glm-ocr")
    model_options = input_data.get("model_options", {})
    metadata = input_data.get("metadata", {})

    if not s3_uri:
        raise ValueError("s3_uri is required")

    logger.info("Processing with variant: %s, options: %s", model_name, model_options)

    s3_uri_clean = s3_uri.replace("s3://", "")
    bucket = s3_uri_clean.split("/")[0]
    key = "/".join(s3_uri_clean.split("/")[1:])

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
        shutil.rmtree(work_dir, ignore_errors=True)


def output_fn(prediction, accept):
    """Format output response."""
    return json.dumps(prediction, ensure_ascii=False)
