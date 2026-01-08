<p align="center">
  <img src="assets/logo.png" alt="OCR Vision Lab Logo" width="120">
</p>

<h1 align="center">OCR Vision Lab</h1>

<p align="center">
  <strong>AWSインフラストラクチャでPaddleOCRモデルをテストするためのサーバーレスOCRプレイグラウンド</strong>
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

OCR Vision Labは、AWSインフラストラクチャ上で[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)モデルをテスト・実験できるWebベースのプレイグラウンドです。ドキュメントのアップロード、OCRモデルの選択、バウンディングボックスオーバーレイによる抽出結果の可視化を直感的なインターフェースで提供します。

> **注意**: これは本番環境向けのソリューションではありません。AWSインフラストラクチャでPaddleOCRモデルをテストするためのプレイグラウンドです。実験、評価、開発目的で設計されています。

![Screenshot](assets/screenshot.png)

## 機能

- **複数のOCRモデル**
  - **PP-OCRv5**: 高精度テキスト抽出に最適化された汎用OCR
  - **PP-StructureV3**: テーブルおよびレイアウト検出を含むドキュメント構造分析
  - **PaddleOCR-VL**: 複雑なドキュメント理解のためのビジョン言語モデル

- **多言語サポート**: 日本語、英語、中国語、韓国語など80以上の言語に対応

- **対応ファイル形式**: PNG、JPEG、TIFF、PDF（最大100MB）

- **インタラクティブな結果ビューア**
  - 詳細な検査のためのズーム・パンコントロール
  - バウンディングボックスオーバーレイの可視化
  - 複数の出力形式（Markdown、HTML、JSON、Blocks）

- **サーバーレスアーキテクチャ**: 自動スケーリングを備えたフルマネージドAWSインフラストラクチャ

## アーキテクチャ
![Architecture](assets/architecture.png)

### コンポーネント

| コンポーネント | AWSサービス | 説明 |
|---------------|-------------|------|
| フロントエンド | CloudFront + S3 | ReactベースのWebアプリケーション |
| 認証 | Cognito | ユーザー認証と認可 |
| API | API Gateway + Lambda | RESTful APIエンドポイント |
| OCRエンジン | SageMaker Endpoint | PaddleOCRモデル推論 |
| ストレージ | S3 | ドキュメント保存とOCR結果 |
| コンテナ | ECR + CodeBuild | SageMaker用Dockerイメージ |

### ワークフロー

1. ユーザーがAmazon Cognitoを通じて認証
2. Reactフロントエンドを通じてドキュメントをアップロード
3. API GatewayがLambda関数をトリガー
4. LambdaがドキュメントをS3にアップロードし、SageMakerエンドポイントを呼び出す
5. SageMakerがドキュメントに対してPaddleOCR推論を実行
6. 結果がS3に保存され、フロントエンドに返される
7. フロントエンドがビジュアルオーバーレイとともに抽出テキストを表示

## はじめに

### 前提条件

- [Node.js](https://nodejs.org/) v18以上
- [pnpm](https://pnpm.io/) v8以上
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

1. **PaddleOCR-Infra**: S3バケット、ECRリポジトリ、CodeBuildプロジェクト
2. **PaddleOCR-Model**: S3にアップロードされるモデルアーティファクト（inference.py）
3. **PaddleOCR-Application**: Cognito、SageMakerエンドポイント、API Gateway、Lambda、フロントエンド

### 手動デプロイ（ローカル）

ローカルマシンからデプロイする場合：

```bash
# AWS資格情報を設定
aws configure

# 依存関係をインストール
pnpm install

# CDKブートストラップ（初回のみ）
cd packages/infra
npx cdk bootstrap

# すべてのスタックをデプロイ
npx cdk deploy --all
```

### コスト管理

> **警告**: SageMakerエンドポイントは24時間365日稼働し、ml.g5.xlargeの場合**月額$1,000以上**のコストが発生します。

使用していないときにコストを削減するには：
```bash
# SageMakerエンドポイントのみを削除
./cleanup.sh --endpoint-only

# すべてのリソースを削除
./cleanup.sh
```

### 環境変数

| 変数 | 説明 |
|------|------|
| `AWS_REGION` | AWSリージョン（デフォルト: ap-northeast-2） |
| `AWS_PROFILE` | AWS CLIプロファイル名 |

## 対応モデル

### PP-OCRv5

高精度でテキスト抽出に最適化された汎用OCR。

**オプション:**
- 言語選択（80以上の言語）
- ドキュメント方向分類
- ドキュメント歪み補正
- テキストライン方向検出

### PP-StructureV3

レイアウト理解機能を備えた高度なドキュメント構造分析。

**オプション:**
- 言語選択
- ドキュメント方向分類
- ドキュメント歪み補正

**出力に含まれるもの:**
- ドキュメントタイトルと段落タイトル
- テーブル（Markdown形式）
- 空間情報付きテキストブロック

### PaddleOCR-VL

複雑なドキュメント理解タスクのためのビジョン言語モデル。

**最適な用途:**
- 混合コンテンツドキュメント
- 複雑なレイアウト
- 文脈理解が必要なドキュメント

## プロジェクト構造

```
aws-ocr-vision-lab/
├── packages/
│   ├── frontend/          # React Webアプリケーション
│   │   ├── src/
│   │   │   ├── components/  # Reactコンポーネント
│   │   │   ├── routes/      # ページルート
│   │   │   └── types/       # TypeScript型
│   │   └── public/          # 静的アセット
│   ├── infra/             # AWS CDKインフラストラクチャ
│   │   ├── src/
│   │   │   └── stacks/      # CDKスタック定義
│   │   ├── lambda/          # Lambda関数コード
│   │   └── model/           # SageMakerモデルコード
│   │       └── code/
│   │           └── inference.py
│   └── common/            # 共有コンポーネント
│       └── constructs/
├── docs/                  # ドキュメント
└── README.md
```

## 技術スタック

- **フロントエンド**: React 19、TypeScript、Vite
- **バックエンド**: Python（Lambda）、PaddleOCR
- **インフラストラクチャ**: AWS CDK（TypeScript）
- **ビルドシステム**: Nx Monorepo
- **AWSサービス**: CloudFront、S3、API Gateway、Lambda、SageMaker、Cognito、ECR、CodeBuild

## ライセンス

このプロジェクトは[MITライセンス](../LICENSE)の下でライセンスされています。
