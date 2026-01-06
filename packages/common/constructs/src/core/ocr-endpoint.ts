import { CfnOutput, Stack, CustomResource } from 'aws-cdk-lib';
import {
  CfnModel,
  CfnEndpointConfig,
  CfnEndpoint,
} from 'aws-cdk-lib/aws-sagemaker';
import {
  Role,
  ServicePrincipal,
  PolicyStatement,
  ManagedPolicy,
  Policy,
} from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface OcrEndpointProps {
  outputBucket: Bucket;
  imageUri?: string;
  modelDataUrl?: string;
  instanceType?: string;
  minCapacity?: number;
  maxCapacity?: number;
  /**
   * Build trigger custom resource to ensure Docker image is built before SageMaker model creation
   */
  buildTrigger?: CustomResource;
}

export class OcrEndpoint extends Construct {
  public readonly endpointName: string;
  public readonly endpoint: CfnEndpoint;
  public readonly executionRole: Role;

  constructor(scope: Construct, id: string, props: OcrEndpointProps) {
    super(scope, id);

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    // Execution Role for SageMaker
    this.executionRole = new Role(this, 'ExecutionRole', {
      assumedBy: new ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
    });

    // Create explicit policy with all permissions (instead of using addToPolicy)
    const executionPolicy = new Policy(this, 'ExecutionPolicy', {
      roles: [this.executionRole],
      statements: [
        // S3 access for output bucket
        new PolicyStatement({
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          resources: [
            props.outputBucket.bucketArn,
            `${props.outputBucket.bucketArn}/*`,
          ],
        }),
        // ECR access for custom image
        new PolicyStatement({
          actions: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
          ],
          resources: ['*'],
        }),
      ],
    });

    // Default image URI (placeholder - needs to be replaced with actual ECR image)
    const imageUri =
      props.imageUri ||
      `${account}.dkr.ecr.${region}.amazonaws.com/paddleocr-vl:latest`;

    // SageMaker Model
    const model = new CfnModel(this, 'Model', {
      executionRoleArn: this.executionRole.roleArn,
      primaryContainer: {
        image: imageUri,
        modelDataUrl: props.modelDataUrl,
        mode: 'SingleModel',
        environment: {
          SAGEMAKER_PROGRAM: 'inference.py',
          PADDLEOCR_HOME: '/opt/ml/code/.paddleocr',
          // TorchServe timeout settings for VL model (text-heavy images take longer)
          TS_DEFAULT_RESPONSE_TIMEOUT: '600',
          TS_MAX_RESPONSE_SIZE: '104857600',
          SAGEMAKER_MODEL_SERVER_TIMEOUT: '600',
          SAGEMAKER_MODEL_SERVER_WORKERS: '1',
        },
      },
    });

    // Ensure policy is created before the model (this is critical!)
    model.node.addDependency(executionPolicy);

    // Ensure Docker image is built before model creation
    if (props.buildTrigger) {
      model.node.addDependency(props.buildTrigger);
    }

    // Endpoint Config with Async Inference
    const endpointConfig = new CfnEndpointConfig(this, 'EndpointConfig', {
      productionVariants: [
        {
          modelName: model.attrModelName,
          variantName: 'AllTraffic',
          initialInstanceCount: 1,
          instanceType: props.instanceType || 'ml.g5.xlarge',
          // Note: managedInstanceScaling과 routingConfig는 AsyncInference와 호환되지 않음
        },
      ],
      asyncInferenceConfig: {
        outputConfig: {
          s3OutputPath: `s3://${props.outputBucket.bucketName}/output/`,
          s3FailurePath: `s3://${props.outputBucket.bucketName}/failure/`,
        },
        clientConfig: {
          maxConcurrentInvocationsPerInstance: 4,
        },
      },
    });

    endpointConfig.addDependency(model);

    // SageMaker Endpoint
    this.endpoint = new CfnEndpoint(this, 'Endpoint', {
      endpointConfigName: endpointConfig.attrEndpointConfigName,
    });

    this.endpoint.addDependency(endpointConfig);

    this.endpointName = this.endpoint.attrEndpointName;

    new CfnOutput(this, 'EndpointName', {
      value: this.endpointName,
      description: 'SageMaker Endpoint Name',
    });
  }
}
