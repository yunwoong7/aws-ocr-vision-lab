import { Duration, CfnOutput, Stack, Fn } from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  Cors,
  GatewayResponse,
  ResponseType,
} from 'aws-cdk-lib/aws-apigateway';
import { Function, Runtime, Architecture, Code } from 'aws-cdk-lib/aws-lambda';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { RuntimeConfig } from './runtime-config.js';

export interface OcrApiProps {
  userPool: UserPool;
  bucket: Bucket;
  endpointName: string;
  lambdaCodePath: string;
}

export class OcrApi extends Construct {
  public readonly api: RestApi;
  public readonly requestLambda: Function;
  public readonly statusLambda: Function;

  constructor(scope: Construct, id: string, props: OcrApiProps) {
    super(scope, id);

    const region = Stack.of(this).region;

    // Cognito Authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // OCR Request Lambda (Python)
    this.requestLambda = new Function(this, 'RequestLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'ocr_request.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(30),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        ENDPOINT_NAME: props.endpointName,
        REGION: region,
      },
    });

    // OCR Status Lambda (Python)
    this.statusLambda = new Function(this, 'StatusLambda', {
      runtime: Runtime.PYTHON_3_14,
      handler: 'ocr_status.handler',
      code: Code.fromAsset(props.lambdaCodePath),
      timeout: Duration.seconds(10),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        REGION: region,
      },
    });

    // Grant S3 permissions
    props.bucket.grantReadWrite(this.requestLambda);
    props.bucket.grantRead(this.statusLambda);

    // Grant SageMaker permissions (wildcard for initial deployment)
    this.requestLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['sagemaker:InvokeEndpointAsync'],
        resources: [
          `arn:aws:sagemaker:${region}:${Stack.of(this).account}:endpoint/*`,
        ],
      }),
    );

    // API Gateway
    this.api = new RestApi(this, 'Api', {
      restApiName: 'OCR API',
      description: 'PaddleOCR-VL Service API',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // POST /ocr
    const ocrResource = this.api.root.addResource('ocr');
    ocrResource.addMethod('POST', new LambdaIntegration(this.requestLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // GET /ocr/{jobId}
    const jobResource = ocrResource.addResource('{jobId}');
    jobResource.addMethod('GET', new LambdaIntegration(this.statusLambda), {
      authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // Add CORS headers to 4XX/5XX error responses (for Cognito auth errors)
    new GatewayResponse(this, 'Default4xxResponse', {
      restApi: this.api,
      type: ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers':
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
      },
    });

    new GatewayResponse(this, 'Default5xxResponse', {
      restApi: this.api,
      type: ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers':
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
      },
    });

    // Add API URL to runtime config (remove trailing slash)
    const apiUrlWithoutTrailingSlash = Fn.join('', [
      'https://',
      this.api.restApiId,
      '.execute-api.',
      region,
      '.amazonaws.com/',
      this.api.deploymentStage.stageName,
    ]);
    RuntimeConfig.ensure(this).config.apiUrl = apiUrlWithoutTrailingSlash;

    new CfnOutput(this, 'ApiUrl', {
      value: apiUrlWithoutTrailingSlash,
      description: 'OCR API URL',
    });
  }
}
