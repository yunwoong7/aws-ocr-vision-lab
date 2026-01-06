import { Stack, StackProps, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  UserIdentity,
  OcrEndpoint,
  OcrApi,
  Frontend,
} from ':aws-ocr-vision-lab/common-constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApplicationStackProps extends StackProps {
  /**
   * Reference to the S3 bucket from InfraStack
   */
  bucket?: Bucket;
  /**
   * ECR image URI from InfraStack
   */
  imageUri?: string;
  /**
   * S3 URL for model.tar.gz from InfraStack
   */
  modelDataUrl?: string;
}

export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: ApplicationStackProps) {
    super(scope, id, props);

    // Get values from props or import from InfraStack
    const bucketName =
      props?.bucket?.bucketName || Fn.importValue('PaddleOCR-BucketName');
    const bucketArn =
      props?.bucket?.bucketArn || Fn.importValue('PaddleOCR-BucketArn');
    const imageUri = props?.imageUri || Fn.importValue('PaddleOCR-ImageUri');
    const modelDataUrl =
      props?.modelDataUrl || Fn.importValue('PaddleOCR-ModelDataUrl');

    // Import bucket from ARN if not passed directly
    const bucket =
      props?.bucket ||
      Bucket.fromBucketAttributes(this, 'ImportedBucket', {
        bucketName: bucketName,
        bucketArn: bucketArn,
      });

    // Cognito User Identity
    const identity = new UserIdentity(this, 'Identity');

    // SageMaker Endpoint for PaddleOCR-VL
    const ocrEndpoint = new OcrEndpoint(this, 'OcrEndpoint', {
      outputBucket: bucket,
      imageUri: imageUri,
      modelDataUrl: modelDataUrl,
      instanceType: 'ml.g5.xlarge',
    });

    // API Gateway + Lambda (Python)
    // Path: packages/infra/lambda (outside src for Python files)
    new OcrApi(this, 'OcrApi', {
      userPool: identity.userPool,
      bucket: bucket,
      endpointName: ocrEndpoint.endpointName,
      lambdaCodePath: path.join(__dirname, '../../lambda'),
    });

    // Frontend Website
    new Frontend(this, 'Frontend');
  }
}
