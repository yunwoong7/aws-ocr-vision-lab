/**
 * Dockerfile contents for the OCR model containers.
 *
 * These strings are passed to `OcrImageBuilder` via the `dockerfileContent`
 * prop and written verbatim into a Dockerfile inside CodeBuild. Changing a
 * string changes its MD5 hash, which triggers an image rebuild.
 */

// PaddleOCR container — paddlepaddle-gpu + paddleocr on a SageMaker PyTorch DLC.
// (Unchanged from the original inline definition in ocr-image-builder.ts.)
export const PADDLEOCR_DOCKERFILE = `# PaddleOCR-VL Docker Image for AWS SageMaker
FROM 763104351884.dkr.ecr.ap-northeast-2.amazonaws.com/pytorch-inference:2.2.0-gpu-py310-cu118-ubuntu20.04-sagemaker

WORKDIR /opt/ml/code
ENV PADDLEOCR_HOME=/opt/ml/code/.paddleocr
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    libgl1-mesa-glx \\
    libglib2.0-0 \\
    libsm6 \\
    libxext6 \\
    libxrender-dev \\
    && rm -rf /var/lib/apt/lists/*

# Install PaddlePaddle GPU
RUN pip install --upgrade pip && \\
    pip install paddlepaddle-gpu==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# Install PaddleOCR
RUN pip install "paddleocr[all]"

EXPOSE 8080`;

// Unlimited-OCR container — Baidu Unlimited-OCR (Deepseek-OCR-derived 3B VLM).
//
// NOTE (verify on first deploy): torch 2.10 / transformers 4.57 are very new
// and have no matching SageMaker DLC. We start from a recent SageMaker PyTorch
// inference DLC (which already ships the sagemaker-inference toolkit that runs
// model_fn/predict_fn) and pip-upgrade torch/transformers on top. If CUDA
// wheels conflict, switch the FROM line to a newer DLC tag or an
// nvidia/cuda base + manual toolkit install.
//
// The 3B weights are baked in at build time (UNLIMITED_OCR_MODEL_PATH) so the
// async endpoint doesn't download ~6GB from Hugging Face on every cold start.
// They live OUTSIDE /opt/ml/model so the model.tar.gz (inference.py) extraction
// does not clobber them.
export const UNLIMITED_OCR_DOCKERFILE = `# Unlimited-OCR Docker Image for AWS SageMaker
FROM 763104351884.dkr.ecr.ap-northeast-2.amazonaws.com/pytorch-inference:2.5.1-gpu-py311-cu124-ubuntu22.04-sagemaker

WORKDIR /opt/ml/code
ENV PYTHONUNBUFFERED=1
ENV UNLIMITED_OCR_MODEL_PATH=/opt/program/unlimited-ocr-weights
ENV HF_HUB_ENABLE_HF_TRANSFER=1

# System dependencies (image decode + PDF rendering via pymupdf)
RUN apt-get update && apt-get install -y \\
    libgl1-mesa-glx \\
    libglib2.0-0 \\
    && rm -rf /var/lib/apt/lists/*

# Unlimited-OCR Python deps (versions per the model card; pin torch/transformers)
RUN pip install --upgrade pip && \\
    pip install \\
      "transformers==4.57.1" \\
      "tokenizers>=0.21" \\
      "einops==0.8.2" \\
      "addict" \\
      "easydict" \\
      "pymupdf==1.27.2.2" \\
      "pillow==12.1.1" \\
      "huggingface_hub[hf_transfer]"

# Bake the model weights into the image (avoids per-cold-start HF download)
RUN python -c "from huggingface_hub import snapshot_download; \\
    snapshot_download('baidu/Unlimited-OCR', local_dir='/opt/program/unlimited-ocr-weights')"

EXPOSE 8080`;

// GLM-OCR container — Zhipu GLM-OCR (0.9B CogViT+GLM-0.5B multimodal OCR).
//
// GLM-OCR's config requires a very new transformers (model_type "glm_ocr",
// transformers_version ~5.0.x dev), so we install transformers from git on top
// of a recent SageMaker PyTorch inference DLC (which ships the
// sagemaker-inference toolkit that runs model_fn/predict_fn). The 0.9B weights
// are baked in at build time (GLM_OCR_MODEL_PATH) so the async endpoint doesn't
// download from Hugging Face on every cold start. They live OUTSIDE /opt/ml/model
// so the model.tar.gz (inference.py) extraction does not clobber them.
export const GLM_OCR_DOCKERFILE = `# GLM-OCR Docker Image for AWS SageMaker
FROM 763104351884.dkr.ecr.ap-northeast-2.amazonaws.com/pytorch-inference:2.5.1-gpu-py311-cu124-ubuntu22.04-sagemaker

WORKDIR /opt/ml/code
ENV PYTHONUNBUFFERED=1
ENV GLM_OCR_MODEL_PATH=/opt/program/glm-ocr-weights
ENV HF_HUB_ENABLE_HF_TRANSFER=1

# System dependencies (image decode + PDF rendering via pymupdf)
RUN apt-get update && apt-get install -y \\
    libgl1-mesa-glx \\
    libglib2.0-0 \\
    && rm -rf /var/lib/apt/lists/*

# GLM-OCR needs transformers from git (model_type glm_ocr, ~5.0.x dev).
RUN pip install --upgrade pip && \\
    pip install \\
      "git+https://github.com/huggingface/transformers.git" \\
      "tokenizers>=0.21" \\
      "pymupdf==1.27.2.2" \\
      "pillow==12.1.1" \\
      "accelerate" \\
      "huggingface_hub[hf_transfer]"

# Bake the model weights into the image (avoids per-cold-start HF download)
RUN python -c "from huggingface_hub import snapshot_download; \\
    snapshot_download('zai-org/GLM-OCR', local_dir='/opt/program/glm-ocr-weights')"

EXPOSE 8080`;
