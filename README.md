<p align="center">
  <img src="docs/assets/logo.png" alt="OCR Vision Lab Logo" width="120">
</p>

<h1 align="center">OCR Vision Lab</h1>

<p align="center">
  <strong>A serverless OCR playground for testing and comparing multiple OCR / vision-language models on AWS infrastructure</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/PaddleOCR-3.2.2-blue?logo=paddlepaddle" alt="PaddleOCR">
  <img src="https://img.shields.io/badge/Unlimited--OCR-3B-orange" alt="Unlimited-OCR">
  <img src="https://img.shields.io/badge/GLM--OCR-0.9B-9cf" alt="GLM-OCR">
  <img src="https://img.shields.io/badge/Qwen3--VL-4B%2F8B-purple" alt="Qwen3-VL">
  <img src="https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/AWS-SageMaker-FF9900?logo=amazonaws&logoColor=white" alt="SageMaker">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/AWS_CDK-2.x-FF9900?logo=amazonaws" alt="AWS CDK">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Nx-22.x-143055?logo=nx&logoColor=white" alt="Nx">
</p>

<p align="center">
  <strong>English</strong> | <a href="docs/README_ko.md">한국어</a> | <a href="docs/README_ja.md">日本語</a>
</p>

<p align="center">
  <a href="docs/demo.md"><strong>View Demo</strong></a>
</p>

<p align="center">
  <a href="#features">Features</a> |
  <a href="#architecture">Architecture</a> |
  <a href="#getting-started">Getting Started</a> |
  <a href="#deployment">Deployment</a> |
  <a href="#supported-models">Models</a>
</p>

---

## Overview

OCR Vision Lab is a web-based playground for testing and **comparing multiple OCR / vision-language models** on AWS infrastructure. Upload a document, run it through several models, and compare the results side by side with bounding-box overlays. It currently ships four model families: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR), [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR), and [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL).

> **Note**: This is not a production solution — it's a playground for testing and comparing OCR models on AWS infrastructure. Designed for experimentation, evaluation, and development purposes.

![Screenshot](docs/assets/screenshot.png)

## Features

- **Multiple Model Families** (each on its own SageMaker endpoint)
  - **PaddleOCR** — `PP-OCRv5` (general text), `PP-StructureV3` (tables/layout), `PaddleOCR-VL` (vision-language)
  - **Unlimited-OCR** — Baidu 3B VLM, `gundam` (high-detail) / `base` (multi-page PDF)
  - **GLM-OCR** — Zhipu 0.9B, compact and fast
  - **Qwen3-VL** — Alibaba `4B` / `8B`, strong multilingual accuracy
  - Run several models on the same document and compare results in run tabs

- **Rich Language Support**: 80+ languages including Korean, English, Chinese, Japanese, and more

- **Supported File Formats**: PNG, JPEG, TIFF, PDF (multi-page, up to 100MB)

- **Interactive Result Viewer**
  - Zoom and pan controls for detailed inspection
  - Bounding box overlay visualization (PaddleOCR / Unlimited-OCR)
  - Multiple output formats (Markdown, HTML, JSON, Blocks)

- **GPU Cost Control**: Per-model power toggle — endpoints default to off (autoscaling min 0) and scale to zero when idle; turn a model on from the sidebar only when you need it

- **Serverless Architecture**: Fully managed AWS infrastructure with auto-scaling

## Architecture
![Architecture](docs/assets/architecture.png)

### Components

| Component | AWS Service | Description |
|-----------|-------------|-------------|
| Frontend | CloudFront + S3 | React-based web application |
| Authentication | Cognito | User authentication and authorization |
| API | API Gateway + Lambda | RESTful API endpoints + endpoint power toggle |
| OCR Engine | SageMaker Async Endpoints | One endpoint per model family (PaddleOCR / Unlimited-OCR / GLM-OCR / Qwen3-VL 4B / Qwen3-VL 8B) |
| Storage | S3 | Document storage and OCR results |
| Container | ECR + CodeBuild | Per-model Docker images for SageMaker |

### Workflow

1. User authenticates via Amazon Cognito
2. Document is uploaded through the React frontend
3. The selected model's endpoint is powered on if needed (confirm prompt; autoscaling min 0 → 1)
4. API Gateway triggers a Lambda, which routes to the right endpoint by model family
5. Lambda uploads the document to S3 and invokes the SageMaker async endpoint
6. SageMaker runs inference (PDFs are split to per-page images)
7. Results are stored in S3, polled by the frontend, and displayed with visual overlays

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (recommended) or manually install:
  - Node.js v22+, pnpm v10+, Python 3.12 (local tooling), AWS CDK
  - Note: Lambda functions run on the Python 3.14 runtime; the local 3.12 is only for the CDK/build toolchain.
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab

# Install tools via mise (auto-installs Node, pnpm, Python, CDK)
mise install

# Install dependencies
pnpm install
```

### Local Development

```bash
# Start the frontend development server
mise run dev
```

---

## Deployment

### Deploy via AWS CloudShell (Recommended)

The easiest way to deploy is using AWS CloudShell, which comes pre-configured with AWS credentials.

1. Open [AWS CloudShell](https://console.aws.amazon.com/cloudshell/) in your AWS Console

2. Clone the repository and run the deployment script:
```bash
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab
chmod +x deploy.sh cleanup.sh
./deploy.sh
```

3. The script will prompt for:
   - Admin email address (for Cognito)
   - SageMaker instance type

4. Wait for deployment to complete (~20-30 minutes)

5. Access the application URL provided at the end

### Stack Structure

| Stack | Description |
|-------|-------------|
| **AwsOcrLab-Infra** | S3 bucket, per-model ECR repositories, CodeBuild projects |
| **AwsOcrLab-Model** | Model artifacts (inference.py) packaged to model.tar.gz in S3 |
| **AwsOcrLab-Identity** | Cognito User Pool and Identity Pool |
| **AwsOcrLab-Endpoint** | PaddleOCR SageMaker async endpoint |
| **AwsOcrLab-UnlimitedEndpoint** | Unlimited-OCR SageMaker async endpoint |
| **AwsOcrLab-GlmEndpoint** | GLM-OCR SageMaker async endpoint |
| **AwsOcrLab-Qwen4bEndpoint** / **-Qwen8bEndpoint** | Qwen3-VL 4B / 8B SageMaker async endpoints |
| **AwsOcrLab-Api** | API Gateway + Lambda functions |
| **AwsOcrLab-Frontend** | CloudFront + S3 static website |

> All endpoints default to **off** (autoscaling min 0). They scale to zero when idle and are powered on from the app's sidebar, so you only pay for GPU time while a model is in use.

### Manual Deployment (Local)

If you prefer to deploy from your local machine:

```bash
# Create .env.local with your AWS config
echo "AWS_REGION=ap-northeast-2" > .env.local
echo "AWS_PROFILE=your-profile" >> .env.local

# Deploy all stacks
mise run deploy

# Or deploy a specific stack
mise run deploy:stack
```

### Cost Management

Endpoints are GPU instances (`ml.g5.xlarge` ≈ **$1.7/hour** each). To avoid the
classic "always-on" bill, **every endpoint defaults to off** (autoscaling min 0)
and scales to zero when idle:

- Turn a model **on** from the app sidebar ("Models (GPU)") only when needed — it powers up in a few minutes.
- Submitting OCR on an off model prompts to turn it on first.
- An idle model (min 0) scales back to zero automatically; you pay nothing while it's off.

To tear resources down entirely:
```bash
# Delete only the SageMaker endpoints
./cleanup.sh --endpoint-only

# Delete all resources
./cleanup.sh
```

### Environment Variables

Configure in `.env.local` (auto-loaded by mise):

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region |
| `AWS_PROFILE` | AWS CLI profile name |

## Supported Models

| Family | Variant | Size | Bounding boxes | Notes |
|--------|---------|------|----------------|-------|
| **PaddleOCR** | PP-OCRv5 | — | ✅ | General text, 80+ languages, orientation/unwarp options |
| | PP-StructureV3 | — | ✅ | Tables + layout structure analysis |
| | PaddleOCR-VL | — | ✅ | Vision-language for complex layouts |
| **Unlimited-OCR** | gundam | 3B | ✅ | High-detail single image (crops for fine text) |
| | base | 3B | ✅ | Balanced single image + multi-page PDF |
| **GLM-OCR** | glm-ocr | 0.9B | ❌ | Compact and fast; markdown text only |
| **Qwen3-VL** | qwen3-vl-4b | 4B | ❌ | Fast VL OCR, strong multilingual accuracy |
| | qwen3-vl-8b | 8B | ❌ | Higher-quality VL OCR |

### PaddleOCR

- **PP-OCRv5** — general-purpose text extraction. Options: language (80+), document orientation classification, unwarping, textline orientation.
- **PP-StructureV3** — document structure analysis. Outputs titles, tables (markdown), and text blocks with spatial info.
- **PaddleOCR-VL** — vision-language model for mixed content and complex layouts.

### Unlimited-OCR (Baidu, 3B VLM)

Document-parsing vision-language model. `gundam` crops the image for fine text;
`base` handles single images and multi-page PDFs. Bounding boxes are parsed from
the model's layout markup, so the Blocks/Document views and overlays work.

### GLM-OCR (Zhipu, 0.9B)

Compact multimodal OCR. Very fast and light, but text-only (no bounding boxes) —
results render in the Markdown view.

### Qwen3-VL (Alibaba, 4B / 8B)

Vision-language OCR with strong multilingual (incl. Korean) accuracy. Text-only
output today (no bounding boxes); 4B is faster, 8B is higher quality.

## Project Structure

```
aws-ocr-vision-lab/
├── .mise.toml               # Tool versions & tasks (mise)
├── .env.local                # AWS profile & region (git-ignored)
├── packages/
│   ├── frontend/             # React web application
│   │   └── src/
│   │       ├── components/
│   │       │   ├── OcrPage/    # Result viewer components
│   │       │   ├── AppLayout/  # App shell & sidebar
│   │       │   └── DocumentEditor/
│   │       ├── hooks/          # Custom React hooks
│   │       ├── utils/          # PDF & OCR helper utilities
│   │       ├── routes/         # Page routes
│   │       └── types/          # TypeScript types
│   ├── infra/                # AWS CDK infrastructure
│   │   ├── src/stacks/         # CDK stack definitions
│   │   ├── src/dockerfiles.ts  # Per-model container Dockerfiles
│   │   ├── lambda/             # Lambda functions (Python)
│   │   ├── layers/             # Lambda layers (DuckDB)
│   │   └── model/              # SageMaker inference code per family
│   │       ├── code/             # PaddleOCR
│   │       ├── unlimited/        # Unlimited-OCR
│   │       ├── glm/              # GLM-OCR
│   │       └── qwen/             # Qwen3-VL (4B/8B share this)
│   └── common/constructs/   # Shared CDK constructs
├── docs/                     # Documentation
└── README.md
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Python 3.14 (Lambda), DuckDB
- **Models**: PaddleOCR, Unlimited-OCR, GLM-OCR, Qwen3-VL (Hugging Face Transformers on SageMaker)
- **Infrastructure**: AWS CDK (TypeScript)
- **Build System**: Nx Monorepo, mise
- **AWS Services**: CloudFront, S3, API Gateway, Lambda, SageMaker, Cognito, ECR, CodeBuild, Application Auto Scaling

## License

This project is licensed under the [MIT License](LICENSE).

