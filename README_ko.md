<p align="center">
  <img src="docs/assets/logo.png" alt="OCR Vision Lab Logo" width="120">
</p>

<h1 align="center">OCR Vision Lab</h1>

<p align="center">
  <strong>AWS 인프라에서 PaddleOCR 모델을 테스트하기 위한 서버리스 OCR 플레이그라운드</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/PaddleOCR-3.2.2-blue?logo=paddlepaddle" alt="PaddleOCR">
  <img src="https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/AWS-SageMaker-FF9900?logo=amazonaws&logoColor=white" alt="SageMaker">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/AWS_CDK-2.x-FF9900?logo=amazonaws" alt="AWS CDK">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Nx-22.x-143055?logo=nx&logoColor=white" alt="Nx">
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>한국어</strong>
</p>

<p align="center">
  <a href="#기능">기능</a> |
  <a href="#아키텍처">아키텍처</a> |
  <a href="#시작하기">시작하기</a> |
  <a href="#배포">배포</a> |
  <a href="#지원-모델">모델</a>
</p>

---

## 개요

OCR Vision Lab은 AWS 인프라에서 [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 모델을 테스트하고 실험할 수 있는 웹 기반 플레이그라운드입니다. 문서를 업로드하고, OCR 모델을 선택하고, 바운딩 박스 오버레이로 추출 결과를 시각화할 수 있는 직관적인 인터페이스를 제공합니다.

> **참고**: 이것은 프로덕션 솔루션이 아닙니다 — AWS 인프라에서 PaddleOCR 모델을 테스트하기 위한 플레이그라운드입니다. 실험, 평가 및 개발 목적으로 설계되었습니다.

![Screenshot](docs/assets/screenshot.png)

## 기능

- **다중 OCR 모델**
  - **PP-OCRv5**: 높은 정확도의 범용 텍스트 추출 OCR
  - **PP-StructureV3**: 테이블 및 레이아웃 감지를 포함한 문서 구조 분석
  - **PaddleOCR-VL**: 복잡한 문서 이해를 위한 비전-언어 모델

- **다국어 지원**: 한국어, 영어, 중국어, 일본어 등 80개 이상의 언어 지원

- **인터랙티브 결과 뷰어**
  - 상세 검사를 위한 확대/축소 및 이동 컨트롤
  - 바운딩 박스 오버레이 시각화
  - 다양한 출력 형식 (Markdown, HTML, JSON, Blocks)

- **서버리스 아키텍처**: 자동 스케일링이 가능한 완전 관리형 AWS 인프라

## 아키텍처
![Architecture](docs/assets/architecture.png)

### 구성 요소

| 구성 요소 | AWS 서비스 | 설명 |
|-----------|------------|------|
| 프론트엔드 | CloudFront + S3 | React 기반 웹 애플리케이션 |
| 인증 | Cognito | 사용자 인증 및 권한 부여 |
| API | API Gateway + Lambda | RESTful API 엔드포인트 |
| OCR 엔진 | SageMaker Endpoint | PaddleOCR 모델 추론 |
| 스토리지 | S3 | 문서 저장 및 OCR 결과 |
| 컨테이너 | ECR + CodeBuild | SageMaker용 Docker 이미지 |

### 워크플로우

1. 사용자가 Amazon Cognito를 통해 인증
2. React 프론트엔드를 통해 문서 업로드
3. API Gateway가 Lambda 함수 트리거
4. Lambda가 문서를 S3에 업로드하고 SageMaker 엔드포인트 호출
5. SageMaker가 문서에 대해 PaddleOCR 추론 실행
6. 결과가 S3에 저장되고 프론트엔드로 반환
7. 프론트엔드가 시각적 오버레이와 함께 추출된 텍스트 표시

## 시작하기

### 사전 요구 사항

- [Node.js](https://nodejs.org/) v18 이상
- [pnpm](https://pnpm.io/) v8 이상
- [AWS CLI](https://aws.amazon.com/cli/) (자격 증명 설정 필요)
- [AWS CDK](https://aws.amazon.com/cdk/) v2

### 설치

```bash
# 저장소 복제
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab

# 의존성 설치
pnpm install
```

### 로컬 개발

```bash
# 프론트엔드 개발 서버 시작
pnpm nx run frontend:serve
```

---

## 배포

### AWS CloudShell로 배포 (권장)

가장 쉬운 배포 방법은 AWS 자격 증명이 미리 구성된 AWS CloudShell을 사용하는 것입니다.

1. AWS 콘솔에서 [AWS CloudShell](https://console.aws.amazon.com/cloudshell/)을 엽니다

2. 저장소를 복제하고 배포 스크립트를 실행합니다:
```bash
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab
chmod +x deploy.sh cleanup.sh
./deploy.sh
```

3. 스크립트가 다음을 묻습니다:
   - 관리자 이메일 주소 (Cognito용)
   - SageMaker 인스턴스 유형

4. 배포가 완료될 때까지 대기합니다 (~20-30분)

5. 마지막에 제공되는 애플리케이션 URL로 접속합니다

### 스택 구조

1. **PaddleOCR-Infra**: S3 버킷, ECR 저장소, CodeBuild 프로젝트
2. **PaddleOCR-Model**: S3에 업로드되는 모델 아티팩트 (inference.py)
3. **PaddleOCR-Application**: Cognito, SageMaker 엔드포인트, API Gateway, Lambda, 프론트엔드

### 수동 배포 (로컬)

로컬 머신에서 배포하려면:

```bash
# AWS 자격 증명 설정
aws configure

# 의존성 설치
pnpm install

# CDK 부트스트랩 (최초 1회만)
cd packages/infra
npx cdk bootstrap

# 모든 스택 배포
npx cdk deploy --all
```

### 비용 관리

> **경고**: SageMaker 엔드포인트는 24/7 실행되며 ml.g5.xlarge 기준 **월 $1,000 이상**의 비용이 발생합니다.

사용하지 않을 때 비용을 절감하려면:
```bash
# SageMaker 엔드포인트만 삭제
./cleanup.sh --endpoint-only

# 모든 리소스 삭제
./cleanup.sh
```

### 환경 변수

| 변수 | 설명 |
|------|------|
| `AWS_REGION` | AWS 리전 (기본값: ap-northeast-2) |
| `AWS_PROFILE` | AWS CLI 프로필 이름 |

## 지원 모델

### PP-OCRv5

높은 정확도로 텍스트 추출에 최적화된 범용 OCR.

**옵션:**
- 언어 선택 (80개 이상 언어)
- 문서 방향 분류
- 문서 왜곡 보정
- 텍스트 라인 방향 감지

### PP-StructureV3

레이아웃 이해 기능이 있는 고급 문서 구조 분석.

**옵션:**
- 언어 선택
- 문서 방향 분류
- 문서 왜곡 보정

**출력 포함:**
- 문서 제목 및 단락 제목
- 테이블 (마크다운 형식)
- 공간 정보가 포함된 텍스트 블록

### PaddleOCR-VL

복잡한 문서 이해 작업을 위한 비전-언어 모델.

**적합한 용도:**
- 혼합 콘텐츠 문서
- 복잡한 레이아웃
- 맥락적 이해가 필요한 문서

## 프로젝트 구조

```
aws-ocr-vision-lab/
├── packages/
│   ├── frontend/          # React 웹 애플리케이션
│   │   ├── src/
│   │   │   ├── components/  # React 컴포넌트
│   │   │   ├── routes/      # 페이지 라우트
│   │   │   └── types/       # TypeScript 타입
│   │   └── public/          # 정적 자산
│   ├── infra/             # AWS CDK 인프라
│   │   ├── src/
│   │   │   └── stacks/      # CDK 스택 정의
│   │   ├── lambda/          # Lambda 함수 코드
│   │   └── model/           # SageMaker 모델 코드
│   │       └── code/
│   │           └── inference.py
│   └── common/            # 공유 구성 요소
│       └── constructs/
├── docs/                  # 문서
└── README.md
```

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Vite
- **백엔드**: Python (Lambda), PaddleOCR
- **인프라**: AWS CDK (TypeScript)
- **빌드 시스템**: Nx Monorepo
- **AWS 서비스**: CloudFront, S3, API Gateway, Lambda, SageMaker, Cognito, ECR, CodeBuild

## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)에 따라 라이선스가 부여됩니다.

