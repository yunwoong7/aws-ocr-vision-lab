import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  ObjectOwnership,
  HttpMethods,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface OcrBucketProps {
  removalPolicy?: RemovalPolicy;
}

export class OcrBucket extends Construct {
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: OcrBucketProps = {}) {
    super(scope, id);

    this.bucket = new Bucket(this, 'OcrBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'DeleteInputAfter7Days',
          prefix: 'input/',
          expiration: Duration.days(7),
        },
        {
          id: 'DeleteOutputAfter30Days',
          prefix: 'output/',
          expiration: Duration.days(30),
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            HttpMethods.GET,
            HttpMethods.PUT,
            HttpMethods.POST,
            HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'OCR Bucket Name',
    });

    new CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'OCR Bucket ARN',
    });
  }
}
