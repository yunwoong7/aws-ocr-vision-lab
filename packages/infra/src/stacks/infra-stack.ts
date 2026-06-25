import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  OcrBucket,
  OcrImageBuilder,
} from ':aws-ocr-vision-lab/common-constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  PADDLEOCR_DOCKERFILE,
  UNLIMITED_OCR_DOCKERFILE,
  GLM_OCR_DOCKERFILE,
} from '../dockerfiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class InfraStack extends Stack {
  public readonly bucket: Bucket;
  public readonly imageUri: string;
  public readonly unlimitedImageUri: string;
  public readonly glmImageUri: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 Bucket for OCR input/output and model artifacts
    const ocrBucket = new OcrBucket(this, 'OcrBucket');
    this.bucket = ocrBucket.bucket;

    const buildTriggerLambdaPath = path.join(
      __dirname,
      '../../lambda/build-trigger',
    );

    // PaddleOCR: ECR Repository + CodeBuild for Docker image
    const imageBuilder = new OcrImageBuilder(this, 'ImageBuilder', {
      repositoryName: 'paddleocr-vl',
      buildTriggerLambdaPath,
      dockerfileContent: PADDLEOCR_DOCKERFILE,
    });

    this.imageUri = imageBuilder.imageUri;

    // Unlimited-OCR: separate ECR Repository + CodeBuild (different runtime)
    const unlimitedImageBuilder = new OcrImageBuilder(
      this,
      'UnlimitedImageBuilder',
      {
        repositoryName: 'unlimited-ocr',
        buildTriggerLambdaPath,
        dockerfileContent: UNLIMITED_OCR_DOCKERFILE,
      },
    );

    this.unlimitedImageUri = unlimitedImageBuilder.imageUri;

    // GLM-OCR: separate ECR Repository + CodeBuild (transformers-from-git runtime)
    const glmImageBuilder = new OcrImageBuilder(this, 'GlmImageBuilder', {
      repositoryName: 'glm-ocr',
      buildTriggerLambdaPath,
      dockerfileContent: GLM_OCR_DOCKERFILE,
    });

    this.glmImageUri = glmImageBuilder.imageUri;

    // Export values for other stacks
    new CfnOutput(this, 'BucketName', {
      value: ocrBucket.bucket.bucketName,
      exportName: 'AwsOcrLab-BucketName',
    });

    new CfnOutput(this, 'BucketArn', {
      value: ocrBucket.bucket.bucketArn,
      exportName: 'AwsOcrLab-BucketArn',
    });

    new CfnOutput(this, 'ImageUri', {
      value: imageBuilder.imageUri,
      exportName: 'AwsOcrLab-ImageUri',
    });

    new CfnOutput(this, 'UnlimitedImageUri', {
      value: unlimitedImageBuilder.imageUri,
      exportName: 'AwsOcrLab-UnlimitedImageUri',
    });

    new CfnOutput(this, 'GlmImageUri', {
      value: glmImageBuilder.imageUri,
      exportName: 'AwsOcrLab-GlmImageUri',
    });
  }
}
