import { InfraStack } from './stacks/infra-stack.js';
import { ModelStack } from './stacks/model-stack.js';
import { IdentityStack } from './stacks/identity-stack.js';
import { EndpointStack } from './stacks/endpoint-stack.js';
import { ApiStack } from './stacks/api-stack.js';
import { FrontendStack } from './stacks/frontend-stack.js';
import { App } from ':aws-ocr-vision-lab/common-constructs';
import { Tags } from 'aws-cdk-lib';

const app = new App();

// Cost-allocation / ownership tags applied to every resource in the app.
Tags.of(app).add('Project', 'aws-ocr-vision-lab');
Tags.of(app).add('ManagedBy', 'CDK');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION,
};

// InfraStack: ECR, CodeBuild, S3 Bucket
const infraStack = new InfraStack(app, 'AwsOcrLab-Infra', { env });

// ModelStack: inference.py -> model.tar.gz -> S3
const modelStack = new ModelStack(app, 'AwsOcrLab-Model', {
  env,
  bucket: infraStack.bucket,
});
modelStack.addDependency(infraStack);

// IdentityStack: Cognito User Pool + Identity Pool
// Pass CloudFront domain via context for Cognito callback URLs
const frontendDomain = app.node.tryGetContext('frontendDomain');
const identityStack = new IdentityStack(app, 'AwsOcrLab-Identity', {
  env,
  crossRegionReferences: true,
  additionalCallbackUrls: frontendDomain ? [`https://${frontendDomain}`] : [],
});

// EndpointStack: PaddleOCR SageMaker Endpoint
// instanceType can be overridden via `cdk deploy --context instanceType=ml.g5.2xlarge`
const instanceType = app.node.tryGetContext('instanceType') as
  | string
  | undefined;
const endpointStack = new EndpointStack(app, 'AwsOcrLab-Endpoint', {
  env,
  bucket: infraStack.bucket,
  imageUri: infraStack.imageUri,
  modelDataUrl: modelStack.modelDataUrl,
  instanceType,
});
endpointStack.addDependency(modelStack);

// UnlimitedEndpointStack: Unlimited-OCR SageMaker Endpoint (separate runtime)
// instanceType override: `cdk deploy --context unlimitedInstanceType=ml.g5.2xlarge`
const unlimitedInstanceType = app.node.tryGetContext(
  'unlimitedInstanceType',
) as string | undefined;
const unlimitedEndpointStack = new EndpointStack(
  app,
  'AwsOcrLab-UnlimitedEndpoint',
  {
    env,
    bucket: infraStack.bucket,
    imageUri: infraStack.unlimitedImageUri,
    modelDataUrl: modelStack.unlimitedModelDataUrl,
    instanceType: unlimitedInstanceType,
    // transformers-based container; no PaddleOCR env. SageMaker still needs
    // SAGEMAKER_PROGRAM to locate inference.py inside model.tar.gz.
    environment: {
      SAGEMAKER_PROGRAM: 'inference.py',
      SAGEMAKER_MODEL_SERVER_TIMEOUT: '600',
      SAGEMAKER_MODEL_SERVER_WORKERS: '1',
      TS_DEFAULT_RESPONSE_TIMEOUT: '600',
      TS_MAX_RESPONSE_SIZE: '104857600',
    },
  },
);
unlimitedEndpointStack.addDependency(modelStack);

// ApiStack: API Gateway + Lambda
const apiStack = new ApiStack(app, 'AwsOcrLab-Api', {
  env,
  userPool: identityStack.userPool,
  bucket: infraStack.bucket,
  paddleEndpointName: endpointStack.endpointName,
  unlimitedEndpointName: unlimitedEndpointStack.endpointName,
});
apiStack.addDependency(identityStack);
apiStack.addDependency(endpointStack);
apiStack.addDependency(unlimitedEndpointStack);

// FrontendStack: CloudFront + S3
const frontendStack = new FrontendStack(app, 'AwsOcrLab-Frontend', {
  env,
  crossRegionReferences: true,
  apiUrl: apiStack.apiUrl,
  cognitoProps: {
    region: identityStack.region,
    identityPoolId: identityStack.identityPoolId,
    userPoolId: identityStack.userPool.userPoolId,
    userPoolWebClientId: identityStack.userPoolClientId,
  },
});
frontendStack.addDependency(apiStack);
frontendStack.addDependency(identityStack);

app.synth();
