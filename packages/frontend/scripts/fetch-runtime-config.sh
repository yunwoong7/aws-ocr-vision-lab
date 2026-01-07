#!/bin/bash
# Fetch runtime config from deployed CloudFormation stack

STACK_NAME="${STACK_NAME:-PaddleOCR-Application}"
AWS_PROFILE="${AWS_PROFILE:-idp}"
OUTPUT_FILE="$(dirname "$0")/../public/runtime-config.json"

echo "Fetching runtime config from stack: $STACK_NAME"

# Get outputs from CloudFormation
OUTPUTS=$(AWS_PROFILE=$AWS_PROFILE aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output json 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$OUTPUTS" ] || [ "$OUTPUTS" = "null" ]; then
  echo "Warning: Could not fetch stack outputs. Using existing runtime-config.json if available."
  exit 0
fi

# Extract values
USER_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("UserPoolId") and (contains("Client") | not)) | .OutputValue' | head -1)
USER_POOL_CLIENT_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("UserPoolClientId")) | .OutputValue' | head -1)
IDENTITY_POOL_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("IdentityPoolId")) | .OutputValue' | head -1)
API_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey | contains("ApiUrl")) | .OutputValue' | head -1)

# Get region from user pool ID
REGION=$(echo "$USER_POOL_ID" | cut -d'_' -f1)

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "null" ]; then
  echo "Warning: Could not extract UserPoolId from stack outputs."
  exit 0
fi

# Generate runtime-config.json
cat > "$OUTPUT_FILE" << EOF
{
  "cognitoProps": {
    "region": "$REGION",
    "identityPoolId": "$IDENTITY_POOL_ID",
    "userPoolId": "$USER_POOL_ID",
    "userPoolWebClientId": "$USER_POOL_CLIENT_ID"
  },
  "apiUrl": "$API_URL"
}
EOF

echo "Updated runtime-config.json:"
cat "$OUTPUT_FILE"
