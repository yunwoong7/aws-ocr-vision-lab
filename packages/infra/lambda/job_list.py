"""
Lambda function for listing user's OCR jobs from S3.
Returns job metadata from result.json files.
"""

import json
import os
import boto3
from botocore.exceptions import ClientError

BUCKET_NAME = os.environ.get('BUCKET_NAME')
REGION = os.environ.get('REGION', 'ap-northeast-2')

s3_client = boto3.client('s3', region_name=REGION)

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}


def handler(event, context):
    """List all jobs for the authenticated user."""
    try:
        # Get user_id from Cognito claims
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', '')

        if not user_id:
            return error_response(401, 'Unauthorized')

        # List all result.json files for this user
        prefix = f"output/{user_id}/"
        jobs = []

        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
            for obj in page.get('Contents', []):
                key = obj['Key']
                # Only process result.json files
                if key.endswith('/result.json'):
                    try:
                        # Get the result.json content
                        response = s3_client.get_object(Bucket=BUCKET_NAME, Key=key)
                        result_data = json.loads(response['Body'].read().decode('utf-8'))

                        # Extract metadata
                        metadata = result_data.get('metadata', {})
                        if metadata:
                            job = {
                                'id': metadata.get('job_id', ''),
                                'filename': metadata.get('filename', ''),
                                's3Key': metadata.get('s3_key', ''),
                                'createdAt': metadata.get('created_at', ''),
                                'model': result_data.get('model', ''),
                                'modelOptions': result_data.get('model_options', {}),
                                'status': 'completed' if result_data.get('success') else 'failed',
                            }
                            jobs.append(job)
                    except Exception as e:
                        print(f"Error reading {key}: {e}")
                        continue

        # Sort by createdAt descending (newest first)
        jobs.sort(key=lambda x: x.get('createdAt', ''), reverse=True)

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'jobs': jobs,
                'count': len(jobs),
            })
        }

    except Exception as e:
        print(f"Error listing jobs: {e}")
        return error_response(500, str(e))


def error_response(status_code, message):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({'error': message})
    }
