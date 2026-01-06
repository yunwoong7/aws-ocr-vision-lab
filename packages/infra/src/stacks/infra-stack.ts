import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  OcrBucket,
  OcrImageBuilder,
} from ':aws-ocr-vision-lab/common-constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class InfraStack extends Stack {
  public readonly bucket: Bucket;
  public readonly imageUri: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 Bucket for OCR input/output and model artifacts
    const ocrBucket = new OcrBucket(this, 'OcrBucket');
    this.bucket = ocrBucket.bucket;

    // ECR Repository + CodeBuild for Docker image only
    const imageBuilder = new OcrImageBuilder(this, 'ImageBuilder', {
      buildTriggerLambdaPath: path.join(
        __dirname,
        '../../lambda/build-trigger',
      ),
    });

    this.imageUri = imageBuilder.imageUri;

    // Export values for other stacks
    new CfnOutput(this, 'BucketName', {
      value: ocrBucket.bucket.bucketName,
      exportName: 'PaddleOCR-BucketName',
    });

    new CfnOutput(this, 'BucketArn', {
      value: ocrBucket.bucket.bucketArn,
      exportName: 'PaddleOCR-BucketArn',
    });

    new CfnOutput(this, 'ImageUri', {
      value: imageBuilder.imageUri,
      exportName: 'PaddleOCR-ImageUri',
    });
  }
}
