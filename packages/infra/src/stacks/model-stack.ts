import { Stack, StackProps, CustomResource, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Runtime, Function, Code } from 'aws-cdk-lib/aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ModelStackProps extends StackProps {
  /**
   * S3 bucket to store model artifacts
   */
  bucket: Bucket;
}

export class ModelStack extends Stack {
  public readonly modelDataUrl: string;

  constructor(scope: Construct, id: string, props: ModelStackProps) {
    super(scope, id, props);

    const bucket = props.bucket;

    // Read inference.py content
    const inferenceCodePath = path.join(
      __dirname,
      '../../model/code/inference.py',
    );
    const inferenceCode = fs.readFileSync(inferenceCodePath, 'utf-8');

    // Calculate hash of inference.py for change detection
    const codeHash = crypto
      .createHash('md5')
      .update(inferenceCode)
      .digest('hex');

    // Lambda to create tar.gz and upload to S3
    const modelUploaderLambda = new Function(this, 'ModelUploaderLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'index.handler',
      timeout: Duration.minutes(1),
      code: Code.fromAsset(path.join(__dirname, '../../lambda/model-uploader')),
    });

    // Grant S3 write permission
    bucket.grantWrite(modelUploaderLambda);

    // Custom Resource Provider
    const modelUploaderProvider = new Provider(this, 'ModelUploaderProvider', {
      onEventHandler: modelUploaderLambda,
    });

    // Custom Resource to upload model.tar.gz
    new CustomResource(this, 'ModelUploader', {
      serviceToken: modelUploaderProvider.serviceToken,
      properties: {
        BucketName: bucket.bucketName,
        InferenceCode: inferenceCode,
        OutputKey: 'model/model.tar.gz',
        // Hash triggers update when inference.py changes
        CodeHash: codeHash,
      },
    });

    this.modelDataUrl = `s3://${bucket.bucketName}/model/model.tar.gz`;
  }
}
