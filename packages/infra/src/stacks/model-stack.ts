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

// Each entry packages one inference.py into its own model.tar.gz.
// Add a new entry here to ship another model family's inference code.
interface ModelArtifact {
  /** Construct id suffix (must be unique within the stack) */
  id: string;
  /** Path to inference.py, relative to this file */
  codePath: string;
  /** S3 key for the resulting model.tar.gz */
  outputKey: string;
}

const MODEL_ARTIFACTS: ModelArtifact[] = [
  {
    id: 'Paddle',
    codePath: '../../model/code/inference.py',
    outputKey: 'model/model.tar.gz',
  },
  {
    id: 'Unlimited',
    codePath: '../../model/unlimited/inference.py',
    outputKey: 'model/unlimited-model.tar.gz',
  },
  {
    id: 'Glm',
    codePath: '../../model/glm/inference.py',
    outputKey: 'model/glm-model.tar.gz',
  },
];

export class ModelStack extends Stack {
  /** s3:// URL for the PaddleOCR model.tar.gz */
  public readonly modelDataUrl: string;
  /** s3:// URL for the Unlimited-OCR model.tar.gz */
  public readonly unlimitedModelDataUrl: string;
  /** s3:// URL for the GLM-OCR model.tar.gz */
  public readonly glmModelDataUrl: string;

  constructor(scope: Construct, id: string, props: ModelStackProps) {
    super(scope, id, props);

    const bucket = props.bucket;

    // Lambda to create tar.gz and upload to S3 (shared across artifacts)
    const modelUploaderLambda = new Function(this, 'ModelUploaderLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'index.handler',
      timeout: Duration.minutes(1),
      code: Code.fromAsset(path.join(__dirname, '../../lambda/model-uploader')),
    });

    // Grant S3 write permission
    bucket.grantWrite(modelUploaderLambda);

    // Custom Resource Provider (shared)
    const modelUploaderProvider = new Provider(this, 'ModelUploaderProvider', {
      onEventHandler: modelUploaderLambda,
    });

    const urls: Record<string, string> = {};
    for (const artifact of MODEL_ARTIFACTS) {
      const inferenceCode = fs.readFileSync(
        path.join(__dirname, artifact.codePath),
        'utf-8',
      );
      // Hash triggers update when inference.py changes
      const codeHash = crypto
        .createHash('md5')
        .update(inferenceCode)
        .digest('hex');

      new CustomResource(this, `ModelUploader${artifact.id}`, {
        serviceToken: modelUploaderProvider.serviceToken,
        properties: {
          BucketName: bucket.bucketName,
          InferenceCode: inferenceCode,
          OutputKey: artifact.outputKey,
          CodeHash: codeHash,
        },
      });

      urls[artifact.id] = `s3://${bucket.bucketName}/${artifact.outputKey}`;
    }

    this.modelDataUrl = urls['Paddle'];
    this.unlimitedModelDataUrl = urls['Unlimited'];
    this.glmModelDataUrl = urls['Glm'];
  }
}
