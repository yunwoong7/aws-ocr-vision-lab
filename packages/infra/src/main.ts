import { InfraStack } from './stacks/infra-stack.js';
import { ModelStack } from './stacks/model-stack.js';
import { ApplicationStack } from './stacks/application-stack.js';
import { App } from ':aws-ocr-vision-lab/common-constructs';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-2',
};

// InfraStack: ECR, CodeBuild, S3 Bucket
// Docker image only - rebuilds only when Dockerfile changes
const infraStack = new InfraStack(app, 'PaddleOCR-Infra', {
  env,
});

// ModelStack: inference.py -> model.tar.gz -> S3
// Fast deployment (~30 seconds) - rebuilds when inference.py changes
const modelStack = new ModelStack(app, 'PaddleOCR-Model', {
  env,
  bucket: infraStack.bucket,
});
modelStack.addDependency(infraStack);

// ApplicationStack: Cognito, SageMaker, API, Frontend
const appStack = new ApplicationStack(app, 'PaddleOCR-Application', {
  env,
  crossRegionReferences: true,
  bucket: infraStack.bucket,
  imageUri: infraStack.imageUri,
  modelDataUrl: modelStack.modelDataUrl,
});
appStack.addDependency(modelStack);

app.synth();
