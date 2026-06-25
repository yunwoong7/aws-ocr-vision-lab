"""OCR Request Lambda - Submit OCR jobs to SageMaker"""
import json
import os
import uuid
import base64
import logging
import binascii
import boto3
from botocore.exceptions import ClientError
import db_utils

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
BUCKET_NAME = os.environ["BUCKET_NAME"]
PADDLE_ENDPOINT_NAME = os.environ["PADDLE_ENDPOINT_NAME"]
UNLIMITED_ENDPOINT_NAME = os.environ["UNLIMITED_ENDPOINT_NAME"]
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# Map model family -> SageMaker endpoint. The frontend sends `family`; we fall
# back to inferring it from the model id so older clients still work.
ENDPOINT_BY_FAMILY = {
    "paddleocr": PADDLE_ENDPOINT_NAME,
    "unlimited-ocr": UNLIMITED_ENDPOINT_NAME,
}
FAMILY_BY_MODEL = {
    "pp-ocrv5": "paddleocr",
    "pp-structurev3": "paddleocr",
    "paddleocr-vl": "paddleocr",
    "gundam": "unlimited-ocr",
    "base": "unlimited-ocr",
}

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
    # Do not log the raw event — the body can contain base64 image data and
    # the request context carries auth tokens.
    logger.info("OCR request received (method=%s)", event.get("httpMethod"))

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
        # document_id from presigned URL response (shared input across runs)
        presigned_document_id = body.get("document_id")
        filename = body.get("filename")
        model = body.get("model", "paddleocr-vl")
        family = body.get("family") or FAMILY_BY_MODEL.get(model)
        options = body.get("options", {})

        # Either image_base64 or s3_key is required
        if not filename or (not image_base64 and not s3_key):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": "filename and (image_base64 or s3_key) are required"}),
            }

        # Resolve the target endpoint from the model family
        endpoint_name = ENDPOINT_BY_FAMILY.get(family)
        if not endpoint_name:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                "body": json.dumps({"error": f"Unknown model/family: {model}/{family}"}),
            }

        # Get user ID from Cognito claims
        authorizer = event.get("requestContext", {}).get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub", "anonymous")

        # Determine document_id + input key based on upload method
        if s3_key:
            # Validate s3_key belongs to this user's folder
            if not s3_key.startswith(f"{user_id}/"):
                return {
                    "statusCode": 403,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"error": "Invalid s3_key"}),
                }
            # Pre-uploaded (presigned) input shared across this document's runs
            document_id = presigned_document_id or str(uuid.uuid4())
            input_key = s3_key
            logger.info("Using pre-uploaded file for document %s", document_id)
        else:
            # File sent as base64 - decode and upload as the document input
            document_id = presigned_document_id or str(uuid.uuid4())
            input_key = f"{user_id}/{document_id}/input/{filename}"

            try:
                image_buffer = base64.b64decode(image_base64, validate=True)
            except (binascii.Error, ValueError):
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({"error": "Invalid base64 image data"}),
                }

            # Reject oversized payloads before touching S3 (base64 inline path).
            if len(image_buffer) > MAX_FILE_SIZE:
                return {
                    "statusCode": 413,
                    "headers": {"Content-Type": "application/json", **CORS_HEADERS},
                    "body": json.dumps({
                        "error": f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)}MB",
                    }),
                }

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=input_key,
                Body=image_buffer,
                ContentType=get_content_type(filename),
            )
            logger.info(
                "Image uploaded for document %s (%d bytes)", document_id, len(image_buffer)
            )

        # Per-run output + inference-input keys (one OCR result per model).
        # Keeping inference-input.json under runs/{model}/ avoids two models
        # racing on the same file when run concurrently on one document.
        run_prefix = f"{user_id}/{document_id}/runs/{model}"
        output_key = f"{run_prefix}/result.json"
        inference_input_key = f"{run_prefix}/inference-input.json"

        # Prepare SageMaker input with model selection and metadata
        from datetime import datetime
        sagemaker_input = json.dumps({
            "s3_uri": f"s3://{BUCKET_NAME}/{input_key}",
            "output_key": output_key,
            "model": model,
            "model_options": options,
            "metadata": {
                "document_id": document_id,
                "model": model,
                "filename": filename,
                "s3_key": input_key,
                "created_at": datetime.utcnow().isoformat() + "Z",
            }
        })

        # Upload inference input to S3
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=inference_input_key,
            Body=sagemaker_input,
            ContentType="application/json",
        )

        # Invoke the family's SageMaker endpoint asynchronously
        invoke_response = sagemaker.invoke_endpoint_async(
            EndpointName=endpoint_name,
            InputLocation=f"s3://{BUCKET_NAME}/{inference_input_key}",
            ContentType="application/json",
        )

        inference_id = invoke_response.get("InferenceId")
        logger.info("SageMaker async invocation accepted (inference_id=%s)", inference_id)

        # Record/replace this run in document metadata (creates the document
        # row if this is its first run).
        db_utils.upsert_run(
            user_id, document_id, filename, input_key, model, family, options
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "document_id": document_id,
                "model": model,
                "status": "processing",
                "output_key": output_key,
                "inference_id": inference_id,
            }),
        }

    except ClientError as e:
        # AWS-side failure (S3 put / SageMaker invoke). Log details server-side,
        # return a generic message to the client.
        logger.exception("AWS error processing OCR request: %s", e)
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({"error": "Upstream AWS service error"}),
        }

    except Exception as e:
        logger.exception("Error processing OCR request: %s", e)

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json", **CORS_HEADERS},
            "body": json.dumps({
                "error": "Internal server error",
            }),
        }
