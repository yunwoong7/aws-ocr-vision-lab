"""OCR Request Lambda - Submit OCR jobs to SageMaker"""
import json
import os
import uuid
import base64
import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("REGION", "ap-northeast-2")
BUCKET_NAME = os.environ["BUCKET_NAME"]
ENDPOINT_NAME = os.environ["ENDPOINT_NAME"]

s3 = boto3.client("s3", region_name=REGION)
sagemaker = boto3.client("sagemaker-runtime", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
}

CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
}


def get_content_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    return CONTENT_TYPES.get(ext, "application/octet-stream")


def handler(event, context):
    print(f"OCR Request received: {json.dumps(event)}")

    try:
        if not event.get("body"):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "Request body is required"}),
            }

        body = json.loads(event["body"])
        image_base64 = body.get("image_base64")
        s3_key = body.get("s3_key")  # For large file uploads via presigned URL
        filename = body.get("filename")
        model = body.get("model", "paddleocr-vl")
        options = body.get("options", {})

        # Either image_base64 or s3_key is required
        if not filename or (not image_base64 and not s3_key):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "filename and (image_base64 or s3_key) are required"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        job_id = str(uuid.uuid4())
        output_key = f"output/{user_id}/{job_id}/result.json"

        # Determine input key based on upload method
        if s3_key:
            # File was uploaded via presigned URL - use existing S3 key
            input_key = s3_key
            print(f"Using pre-uploaded file: s3://{BUCKET_NAME}/{input_key}")
        else:
            # File sent as base64 - decode and upload
            input_key = f"input/{user_id}/{job_id}/{filename}"
            image_buffer = base64.b64decode(image_base64)

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=input_key,
                Body=image_buffer,
                ContentType=get_content_type(filename),
            )
            print(f"Image uploaded to s3://{BUCKET_NAME}/{input_key}")

        # Prepare SageMaker input with model selection and metadata
        from datetime import datetime
        sagemaker_input = json.dumps({
            "s3_uri": f"s3://{BUCKET_NAME}/{input_key}",
            "output_key": output_key,
            "model": model,
            "model_options": options,
            # Metadata for job listing
            "metadata": {
                "job_id": job_id,
                "filename": filename,
                "s3_key": input_key,
                "created_at": datetime.utcnow().isoformat() + "Z",
            }
        })

        # Upload inference input to S3
        inference_input_key = f"input/{user_id}/{job_id}/inference-input.json"
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=inference_input_key,
            Body=sagemaker_input,
            ContentType="application/json",
        )

        # Invoke SageMaker endpoint asynchronously
        invoke_response = sagemaker.invoke_endpoint_async(
            EndpointName=ENDPOINT_NAME,
            InputLocation=f"s3://{BUCKET_NAME}/{inference_input_key}",
            ContentType="application/json",
        )

        print(f"SageMaker invocation response: {invoke_response}")

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "job_id": job_id,
                "status": "processing",
                "output_key": output_key,
                "inference_id": invoke_response.get("InferenceId"),
            }),
        }

    except Exception as e:
        print(f"Error processing OCR request: {str(e)}")

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
                "message": str(e),
            }),
        }
