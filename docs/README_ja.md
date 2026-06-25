<p align="center">
  <img src="assets/logo.png" alt="OCR Vision Lab Logo" width="120">
</p>

<h1 align="center">OCR Vision Lab</h1>

<p align="center">
  <strong>AWSインフラストラクチャ上で複数のOCR / ビジョン言語モデルをテスト・比較するためのサーバーレスOCRプレイグラウンド</strong>
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
  <a href="../README.md">English</a> | <a href="README_ko.md">한국어</a> | <strong>日本語</strong>
</p>

<p align="center">
  <a href="demo.md"><strong>デモを見る</strong></a>
</p>

<p align="center">
  <a href="#機能">機能</a> |
  <a href="#アーキテクチャ">アーキテクチャ</a> |
  <a href="#はじめに">はじめに</a> |
  <a href="#デプロイ">デプロイ</a> |
  <a href="#対応モデル">モデル</a>
</p>

---

## 概要

OCR Vision Labは、AWSインフラストラクチャ上で**複数のOCR / ビジョン言語モデルをテスト・比較**できるWebベースのプレイグラウンドです。ドキュメントをアップロードし、複数のモデルで実行して、バウンディングボックスオーバーレイとともに結果を横並びで比較できます。現在4つのモデルファミリーを提供しています：[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)、[Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)、[GLM-OCR](https://huggingface.co/zai-org/GLM-OCR)、[Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)。

> **注意**: これは本番環境向けのソリューションではありません。AWSインフラストラクチャでOCRモデルをテスト・比較するためのプレイグラウンドです。実験、評価、開発目的で設計されています。

![Screenshot](assets/screenshot.png)

## 機能

- **複数のモデルファミリー**（それぞれ専用のSageMakerエンドポイント）
  - **PaddleOCR** — `PP-OCRv5`（汎用テキスト）、`PP-StructureV3`（テーブル/レイアウト）、`PaddleOCR-VL`（ビジョン言語）
  - **Unlimited-OCR** — Baidu 3B VLM、`gundam`（高精細）/ `base`（マルチページPDF）
  - **GLM-OCR** — Zhipu 0.9B、コンパクトで高速
  - **Qwen3-VL** — Alibaba `4B` / `8B`、優れた多言語精度
  - 同じドキュメントを複数のモデルで実行し、Runタブで結果を比較

- **豊富な多言語サポート**: 日本語、英語、中国語、韓国語など80以上の言語に対応

- **対応ファイル形式**: PNG、JPEG、TIFF、PDF（マルチページ、最大100MB）

- **インタラクティブな結果ビューア**
  - 詳細な検査のためのズーム・パンコントロール
  - バウンディングボックスオーバーレイの可視化（PaddleOCR / Unlimited-OCR）
  - 複数の出力形式（Markdown、HTML、JSON、Blocks）

- **GPUコスト管理**: モデルごとの電源トグル — エンドポイントはデフォルトでオフ（オートスケーリング最小0）で、アイドル時はゼロにスケールします。必要なときだけサイドバーからモデルをオンにします

- **サーバーレスアーキテクチャ**: 自動スケーリングを備えたフルマネージドAWSインフラストラクチャ

## アーキテクチャ
![Architecture](assets/architecture.png)

### コンポーネント

| コンポーネント | AWSサービス | 説明 |
|---------------|-------------|------|
| フロントエンド | CloudFront + S3 | ReactベースのWebアプリケーション |
| 認証 | Cognito | ユーザー認証と認可 |
| API | API Gateway + Lambda | RESTful APIエンドポイント + エンドポイント電源トグル |
| OCRエンジン | SageMaker 非同期エンドポイント | モデルファミリーごとに1つのエンドポイント（PaddleOCR / Unlimited-OCR / GLM-OCR / Qwen3-VL 4B / Qwen3-VL 8B） |
| ストレージ | S3 | ドキュメント保存とOCR結果 |
| コンテナ | ECR + CodeBuild | SageMaker用のモデルごとのDockerイメージ |

### ワークフロー

1. ユーザーがAmazon Cognitoを通じて認証
2. Reactフロントエンドを通じてドキュメントをアップロード
3. 必要に応じて選択したモデルのエンドポイントがオンになる（確認プロンプト、オートスケーリング最小0 → 1）
4. API GatewayがLambdaをトリガーし、Lambdaがモデルファミリーに応じて適切なエンドポイントにルーティング
5. LambdaがドキュメントをS3にアップロードし、SageMaker非同期エンドポイントを呼び出す
6. SageMakerが推論を実行（PDFはページごとの画像に分割）
7. 結果がS3に保存され、フロントエンドがポーリングしてビジュアルオーバーレイとともに表示

## はじめに

### 前提条件

- [Node.js](https://nodejs.org/) v22以上
- [pnpm](https://pnpm.io/) v10以上
- Python 3.12（ローカルビルドツール用 — Lambda は Python 3.14 ランタイムで実行）
- [AWS CLI](https://aws.amazon.com/cli/)（資格情報の設定が必要）
- [AWS CDK](https://aws.amazon.com/cdk/) v2

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab

# 依存関係をインストール
pnpm install
```

### ローカル開発

```bash
# フロントエンド開発サーバーを起動
pnpm nx run frontend:serve
```

---

## デプロイ

### AWS CloudShellでデプロイ（推奨）

最も簡単なデプロイ方法は、AWS資格情報が事前設定されているAWS CloudShellを使用することです。

1. AWSコンソールで[AWS CloudShell](https://console.aws.amazon.com/cloudshell/)を開きます

2. リポジトリをクローンし、デプロイスクリプトを実行します：
```bash
git clone https://github.com/yunwoong7/aws-ocr-vision-lab.git
cd aws-ocr-vision-lab
chmod +x deploy.sh cleanup.sh
./deploy.sh
```

3. スクリプトが以下を確認します：
   - 管理者メールアドレス（Cognito用）
   - SageMakerインスタンスタイプ

4. デプロイが完了するまで待機します（約20〜30分）

5. 最後に提供されるアプリケーションURLにアクセスします

### スタック構造

| スタック | 説明 |
|---------|------|
| **AwsOcrLab-Infra** | S3バケット、モデルごとのECRリポジトリ、CodeBuildプロジェクト |
| **AwsOcrLab-Model** | S3のmodel.tar.gzにパッケージ化されたモデルアーティファクト（inference.py） |
| **AwsOcrLab-Identity** | Cognito User Pool および Identity Pool |
| **AwsOcrLab-Endpoint** | PaddleOCR SageMaker 非同期エンドポイント |
| **AwsOcrLab-UnlimitedEndpoint** | Unlimited-OCR SageMaker 非同期エンドポイント |
| **AwsOcrLab-GlmEndpoint** | GLM-OCR SageMaker 非同期エンドポイント |
| **AwsOcrLab-Qwen4bEndpoint** / **-Qwen8bEndpoint** | Qwen3-VL 4B / 8B SageMaker 非同期エンドポイント |
| **AwsOcrLab-Api** | API Gateway + Lambda 関数 |
| **AwsOcrLab-Frontend** | CloudFront + S3 静的ウェブサイト |

> すべてのエンドポイントはデフォルトで**オフ**（オートスケーリング最小0）です。アイドル時はゼロにスケールし、アプリのサイドバーからオンにします。そのため、モデルを使用している間のGPU時間に対してのみ課金されます。

### 手動デプロイ（ローカル）

ローカルマシンからデプロイする場合：

```bash
# AWS設定を含む .env.local を作成
echo "AWS_REGION=ap-northeast-2" > .env.local
echo "AWS_PROFILE=your-profile" >> .env.local

# すべてのスタックをデプロイ
mise run deploy

# または特定のスタックをデプロイ
mise run deploy:stack
```

### コスト管理

エンドポイントはGPUインスタンス（`ml.g5.xlarge` ≈ **$1.7/時間** 各）です。古典的な
「常時オン」の請求を避けるため、**すべてのエンドポイントはデフォルトでオフ**（オートスケーリング最小0）で、
アイドル時はゼロにスケールします：

- 必要なときだけアプリのサイドバー（「Models (GPU)」）からモデルを**オン**にします — 数分で起動します。
- オフのモデルでOCRを送信すると、まずオンにするよう促されます。
- アイドル状態のモデル（最小0）は自動的にゼロにスケールバックされます。オフの間は課金されません。

リソースを完全に削除するには：
```bash
# SageMakerエンドポイントのみを削除
./cleanup.sh --endpoint-only

# すべてのリソースを削除
./cleanup.sh
```

### 環境変数

`.env.local` で設定します（miseが自動ロード）：

| 変数 | 説明 |
|------|------|
| `AWS_REGION` | AWSリージョン |
| `AWS_PROFILE` | AWS CLIプロファイル名 |

## 対応モデル

| ファミリー | バリアント | サイズ | バウンディングボックス | 備考 |
|-----------|-----------|--------|----------------------|------|
| **PaddleOCR** | PP-OCRv5 | — | ✅ | 汎用テキスト、80以上の言語、方向/歪み補正オプション |
| | PP-StructureV3 | — | ✅ | テーブル + レイアウト構造分析 |
| | PaddleOCR-VL | — | ✅ | 複雑なレイアウト向けビジョン言語 |
| **Unlimited-OCR** | gundam | 3B | ✅ | 高精細の単一画像（細かいテキスト用にクロップ） |
| | base | 3B | ✅ | バランスの取れた単一画像 + マルチページPDF |
| **GLM-OCR** | glm-ocr | 0.9B | ❌ | コンパクトで高速。Markdownテキストのみ |
| **Qwen3-VL** | qwen3-vl-4b | 4B | ❌ | 高速なVL OCR、優れた多言語精度 |
| | qwen3-vl-8b | 8B | ❌ | より高品質なVL OCR |

### PaddleOCR

- **PP-OCRv5** — 汎用テキスト抽出。オプション：言語（80以上）、ドキュメント方向分類、歪み補正、テキストライン方向。
- **PP-StructureV3** — ドキュメント構造分析。タイトル、テーブル（Markdown）、空間情報付きテキストブロックを出力。
- **PaddleOCR-VL** — 混合コンテンツや複雑なレイアウト向けのビジョン言語モデル。

### Unlimited-OCR (Baidu, 3B VLM)

ドキュメント解析向けのビジョン言語モデル。`gundam` は細かいテキスト用に画像をクロップし、
`base` は単一画像とマルチページPDFを処理します。バウンディングボックスはモデルのレイアウト
マークアップから解析されるため、Blocks/Documentビューとオーバーレイが機能します。

### GLM-OCR (Zhipu, 0.9B)

コンパクトなマルチモーダルOCR。非常に高速で軽量ですが、テキストのみ（バウンディングボックスなし）で、
結果はMarkdownビューに表示されます。

### Qwen3-VL (Alibaba, 4B / 8B)

優れた多言語（韓国語を含む）精度を備えたビジョン言語OCR。現在はテキストのみの出力
（バウンディングボックスなし）で、4Bはより高速、8Bはより高品質です。

## プロジェクト構造

```
aws-ocr-vision-lab/
├── .mise.toml               # ツールバージョン & タスク（mise）
├── .env.local                # AWSプロファイル & リージョン（git-ignored）
├── packages/
│   ├── frontend/             # React Webアプリケーション
│   │   └── src/
│   │       ├── components/
│   │       │   ├── OcrPage/    # 結果ビューアコンポーネント
│   │       │   ├── AppLayout/  # アプリシェル & サイドバー
│   │       │   └── DocumentEditor/
│   │       ├── hooks/          # カスタムReactフック
│   │       ├── utils/          # PDF & OCRヘルパーユーティリティ
│   │       ├── routes/         # ページルート
│   │       └── types/          # TypeScript型
│   ├── infra/                # AWS CDKインフラストラクチャ
│   │   ├── src/stacks/         # CDKスタック定義
│   │   ├── src/dockerfiles.ts  # モデルごとのコンテナDockerfile
│   │   ├── lambda/             # Lambda関数（Python）
│   │   ├── layers/             # Lambdaレイヤー（DuckDB）
│   │   └── model/              # ファミリーごとのSageMaker推論コード
│   │       ├── code/             # PaddleOCR
│   │       ├── unlimited/        # Unlimited-OCR
│   │       ├── glm/              # GLM-OCR
│   │       └── qwen/             # Qwen3-VL（4B/8Bで共有）
│   └── common/constructs/   # 共有CDKコンストラクト
├── docs/                     # ドキュメント
└── README.md
```

## 技術スタック

- **フロントエンド**: React 19、TypeScript、Vite
- **バックエンド**: Python 3.14（Lambda）、DuckDB
- **モデル**: PaddleOCR、Unlimited-OCR、GLM-OCR、Qwen3-VL（SageMaker上のHugging Face Transformers）
- **インフラストラクチャ**: AWS CDK（TypeScript）
- **ビルドシステム**: Nx Monorepo、mise
- **AWSサービス**: CloudFront、S3、API Gateway、Lambda、SageMaker、Cognito、ECR、CodeBuild、Application Auto Scaling

## ライセンス

このプロジェクトは[MITライセンス](../LICENSE)の下でライセンスされています。
