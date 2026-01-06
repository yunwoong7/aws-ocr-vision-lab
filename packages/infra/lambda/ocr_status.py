"""OCR Status Lambda - Check job status from S3"""
import json
import os
import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-northeast-2")
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
}


def handler(event, context):
    print(f"OCR Status request received: {json.dumps(event)}")

    try:
        path_params = event.get("pathParameters", {}) or {}
        job_id = path_params.get("jobId")

        if not job_id:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "jobId is required"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        output_key = f"output/{user_id}/{job_id}/result.json"
        failure_key = f"failure/{user_id}/{job_id}/error.json"

        # Check if result exists
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=output_key)

            # Result exists, read it
            response = s3.get_object(Bucket=BUCKET_NAME, Key=output_key)
            result_str = response["Body"].read().decode("utf-8")
            result = json.loads(result_str)

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

            if error_code in ("404", "NoSuchKey", "NotFound"):
                # Check for failure
                try:
                    s3.head_object(Bucket=BUCKET_NAME, Key=failure_key)

                    # Failure exists
                    failure_response = s3.get_object(Bucket=BUCKET_NAME, Key=failure_key)
                    failure_str = failure_response["Body"].read().decode("utf-8")
                    failure_result = json.loads(failure_str)

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

            raise

    except Exception as e:
        print(f"Error checking OCR status: {str(e)}")

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
                "message": str(e),
            }),
        }
