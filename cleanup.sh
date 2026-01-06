#!/bin/bash

echo ""
echo "==========================================================================="
echo "  OCR Vision Lab - Cleanup Script                                          "
echo "---------------------------------------------------------------------------"
echo "  This script will delete OCR Vision Lab resources.                        "
echo "==========================================================================="
echo ""

# Default parameters
ENDPOINT_ONLY="false"
FORCE="false"

# Parse command-line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --endpoint-only) ENDPOINT_ONLY="true" ;;
        --force) FORCE="true" ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --endpoint-only       Only delete SageMaker endpoint (stop costs)"
            echo "  --force               Skip confirmation prompts"
            echo "  --help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./cleanup.sh                    # Delete all resources"
            echo "  ./cleanup.sh --endpoint-only    # Only delete endpoint"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "Endpoint Only: $ENDPOINT_ONLY"
echo ""

# Function to delete SageMaker endpoint
delete_endpoint() {
    echo "Searching for SageMaker endpoints..."

    # Find endpoint name from CloudFormation
    ENDPOINT_NAME=$(aws cloudformation describe-stacks \
        --stack-name PaddleOCR-Application \
        --query 'Stacks[0].Outputs[?OutputKey==`EndpointName`].OutputValue' \
        --output text 2>/dev/null || echo "")

    if [[ -z "$ENDPOINT_NAME" ]] || [[ "$ENDPOINT_NAME" == "None" ]]; then
        # Try to find by pattern
        ENDPOINT_NAME=$(aws sagemaker list-endpoints \
            --query "Endpoints[?contains(EndpointName, 'paddleocr') || contains(EndpointName, 'PaddleOCR')].EndpointName" \
            --output text 2>/dev/null | head -1)
    fi

    if [[ -n "$ENDPOINT_NAME" ]] && [[ "$ENDPOINT_NAME" != "None" ]]; then
        echo "Found endpoint: $ENDPOINT_NAME"

        if [[ "$FORCE" != "true" ]]; then
            read -p "Delete SageMaker endpoint '$ENDPOINT_NAME'? (y/N): " answer
            if [[ "${answer:0:1}" != "y" ]] && [[ "${answer:0:1}" != "Y" ]]; then
                echo "Skipping endpoint deletion."
                return
            fi
        fi

        echo "Deleting SageMaker endpoint..."
        aws sagemaker delete-endpoint --endpoint-name "$ENDPOINT_NAME" 2>/dev/null || true

        # Delete endpoint config
        echo "Deleting endpoint configuration..."
        aws sagemaker delete-endpoint-config --endpoint-config-name "$ENDPOINT_NAME" 2>/dev/null || true

        # Find and delete model
        MODEL_NAME=$(aws sagemaker list-models \
            --query "Models[?contains(ModelName, 'paddleocr') || contains(ModelName, 'PaddleOCR')].ModelName" \
            --output text 2>/dev/null | head -1)

        if [[ -n "$MODEL_NAME" ]] && [[ "$MODEL_NAME" != "None" ]]; then
            echo "Deleting SageMaker model: $MODEL_NAME"
            aws sagemaker delete-model --model-name "$MODEL_NAME" 2>/dev/null || true
        fi

        echo "SageMaker resources deleted."
    else
        echo "No SageMaker endpoint found."
    fi
}

# If endpoint-only mode
if [[ "$ENDPOINT_ONLY" == "true" ]]; then
    delete_endpoint
    echo ""
    echo "==========================================================================="
    echo "  Endpoint cleanup complete!                                               "
    echo "---------------------------------------------------------------------------"
    echo "  SageMaker endpoint has been deleted to stop costs.                       "
    echo "  Other resources (S3, Cognito, Frontend) are still available.            "
    echo ""
    echo "  To redeploy the endpoint later, run:                                     "
    echo "  ./deploy.sh                                                              "
    echo "==========================================================================="
    exit 0
fi

# Full cleanup
if [[ "$FORCE" != "true" ]]; then
    echo "WARNING: This will delete ALL resources including:"
    echo "  - SageMaker endpoint and model"
    echo "  - S3 bucket and all objects"
    echo "  - Cognito user pool"
    echo "  - API Gateway"
    echo "  - CloudFront distribution"
    echo "  - ECR repository and images"
    echo "  - All CloudFormation stacks"
    echo ""
    read -p "Are you sure you want to delete ALL resources? (y/N): " answer
    if [[ "${answer:0:1}" != "y" ]] && [[ "${answer:0:1}" != "Y" ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
fi

echo ""
echo "Starting full cleanup..."
echo ""

# 1. Delete SageMaker endpoint first
delete_endpoint

# 2. Empty S3 bucket
echo "Emptying S3 bucket..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name PaddleOCR-Infra \
    --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [[ -n "$BUCKET_NAME" ]] && [[ "$BUCKET_NAME" != "None" ]]; then
    echo "Emptying bucket: $BUCKET_NAME"
    aws s3 rm s3://$BUCKET_NAME --recursive 2>/dev/null || true
fi

# 3. Delete ECR images
echo "Deleting ECR images..."
ECR_REPO=$(aws cloudformation describe-stacks \
    --stack-name PaddleOCR-Infra \
    --query 'Stacks[0].Outputs[?OutputKey==`EcrRepositoryName`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [[ -n "$ECR_REPO" ]] && [[ "$ECR_REPO" != "None" ]]; then
    echo "Deleting images from: $ECR_REPO"
    IMAGES=$(aws ecr list-images --repository-name $ECR_REPO --query 'imageIds[*]' --output json 2>/dev/null || echo "[]")
    if [[ "$IMAGES" != "[]" ]]; then
        aws ecr batch-delete-image --repository-name $ECR_REPO --image-ids "$IMAGES" 2>/dev/null || true
    fi
fi

# 4. Delete CloudFormation stacks in order
echo ""
echo "Deleting CloudFormation stacks..."

STACKS=(
    "PaddleOCR-Application"
    "PaddleOCR-Model"
    "PaddleOCR-Infra"
    "ocr-vision-lab-codebuild-deploy"
)

for stack in "${STACKS[@]}"; do
    echo "Checking stack: $stack"
    STATUS=$(aws cloudformation describe-stacks --stack-name $stack --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")

    if [[ "$STATUS" != "NOT_FOUND" ]]; then
        echo "Deleting stack: $stack"
        aws cloudformation delete-stack --stack-name $stack

        echo "Waiting for stack deletion..."
        aws cloudformation wait stack-delete-complete --stack-name $stack 2>/dev/null || true
        echo "Stack $stack deleted."
    else
        echo "Stack $stack not found, skipping."
    fi
done

# 5. Clean up CloudWatch log groups
echo ""
echo "Cleaning up CloudWatch log groups..."
LOG_GROUPS=$(aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/PaddleOCR" \
    --query 'logGroups[*].logGroupName' \
    --output text 2>/dev/null || echo "")

for log_group in $LOG_GROUPS; do
    echo "Deleting log group: $log_group"
    aws logs delete-log-group --log-group-name $log_group 2>/dev/null || true
done

# CodeBuild log groups
LOG_GROUPS=$(aws logs describe-log-groups \
    --log-group-name-prefix "/aws/codebuild/ocr-vision-lab" \
    --query 'logGroups[*].logGroupName' \
    --output text 2>/dev/null || echo "")

for log_group in $LOG_GROUPS; do
    echo "Deleting log group: $log_group"
    aws logs delete-log-group --log-group-name $log_group 2>/dev/null || true
done

# 6. Clean up deployment info file
if [[ -f "deployment-info.json" ]]; then
    rm -f "deployment-info.json"
    echo "Deleted deployment-info.json"
fi

echo ""
echo "==========================================================================="
echo "  Cleanup Complete!                                                        "
echo "---------------------------------------------------------------------------"
echo "  All OCR Vision Lab resources have been deleted.                          "
echo ""
echo "  To redeploy, run:                                                        "
echo "  ./deploy.sh                                                              "
echo "==========================================================================="
