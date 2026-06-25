"""
Lambda function to generate S3 presigned URLs for file uploads.
Supports files up to 100MB.
"""

import json
import os
import uuid
import logging
import boto3
from botocore.config import Config

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ.get('BUCKET_NAME')
REGION = os.environ.get('REGION') or os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

s3_client = boto3.client(
    's3',
    region_name=REGION,
    endpoint_url=f'https://s3.{REGION}.amazonaws.com',
    config=Config(signature_version='s3v4')
)


def handler(event, context):
    """Generate presigned URL for S3 upload."""
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        filename = body.get('filename', 'upload')
        content_type = body.get('content_type', 'application/octet-stream')
        content_length = body.get('content_length')

        # Sanitize filename: strip any path components to prevent traversal
        # (e.g. "../../other-user/x") and keep only the basename.
        filename = os.path.basename(filename) or 'upload'

        # Reject oversized uploads up front when the client declares a size.
        if content_length is not None:
            try:
                if int(content_length) > MAX_FILE_SIZE:
                    return error_response(
                        413,
                        f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB",
                    )
            except (TypeError, ValueError):
                return error_response(400, 'Invalid content_length')

        # Get user ID from Cognito claims
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', 'anonymous')

        # Generate document_id upfront so the file goes directly into its
        # folder. The input is shared across all model runs of this document.
        document_id = str(uuid.uuid4())
        s3_key = f"{user_id}/{document_id}/input/{filename}"

        # Generate presigned URL for PUT
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=300,  # 5 minutes
        )

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            },
            'body': json.dumps({
                'upload_url': presigned_url,
                's3_key': s3_key,
                'document_id': document_id,
            })
        }

    except Exception as e:
        logger.exception("Error generating presigned URL: %s", e)
        return error_response(500, 'Internal server error')


def error_response(status_code, message):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        'body': json.dumps({'error': message}),
    }
