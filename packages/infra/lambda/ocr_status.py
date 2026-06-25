"""OCR Status Lambda - Check job status from S3"""
import json
import os
import logging
import boto3
from botocore.exceptions import ClientError
import db_utils

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
}


def handler(event, context):
    try:
        path_params = event.get("pathParameters", {}) or {}
        # Path variable is named {jobId} for API Gateway compatibility, but it
        # carries the document id.
        document_id = path_params.get("jobId")
        model = path_params.get("model")
        logger.info("OCR status request (document_id=%s, model=%s)", document_id, model)

        if not document_id or not model:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "documentId and model are required"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        run_prefix = f"{user_id}/{document_id}/runs/{model}"
        output_key = f"{run_prefix}/result.json"
        failure_key = f"{run_prefix}/error.json"

        # Check if result exists
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=output_key)

            # Result exists, read it
            response = s3.get_object(Bucket=BUCKET_NAME, Key=output_key)
            result_str = response["Body"].read().decode("utf-8")
            result = json.loads(result_str)

            # Update run status in document metadata
            db_utils.update_run_status(user_id, document_id, model, "completed")

            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({
                    "status": "completed",
                    "result": result,
                }),
            }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")

            if error_code not in ("404", "NoSuchKey", "NotFound"):
                logger.exception("Unexpected S3 error (%s): %s", error_code, e)
                return {
                    "statusCode": 500,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"error": "Internal server error"}),
                }

            # Result not found - check for failure
            try:
                s3.head_object(Bucket=BUCKET_NAME, Key=failure_key)

                failure_response = s3.get_object(Bucket=BUCKET_NAME, Key=failure_key)
                failure_str = failure_response["Body"].read().decode("utf-8")
                failure_result = json.loads(failure_str)

                # Update run status in document metadata
                db_utils.update_run_status(user_id, document_id, model, "failed")

                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({
                        "status": "failed",
                        "error": failure_result.get("message", "OCR processing failed"),
                    }),
                }

            except ClientError:
                # No failure file either, still processing
                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"status": "processing"}),
                }

    except Exception as e:
        logger.exception("Error checking OCR status: %s", e)

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
            }),
        }
