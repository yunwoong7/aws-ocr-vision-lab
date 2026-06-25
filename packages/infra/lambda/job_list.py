"""
Lambda function for listing a user's OCR documents (with their per-model runs)
from DuckDB/Parquet metadata.
"""

import json
import os
import logging
import db_utils

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ.get('BUCKET_NAME')
REGION = os.environ.get('REGION') or os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}


def handler(event, context):
    """List all documents (with their runs) for the authenticated user."""
    try:
        # Get user_id from Cognito claims
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', '')

        if not user_id:
            return error_response(401, 'Unauthorized')

        documents = db_utils.list_documents(user_id)

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'documents': documents,
                'count': len(documents),
            })
        }

    except Exception as e:
        logger.exception("Error listing documents: %s", e)
        return error_response(500, 'Internal server error')


def error_response(status_code, message):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({'error': message})
    }
