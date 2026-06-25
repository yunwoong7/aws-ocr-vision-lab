#!/usr/bin/env bash
#
# Pre-deploy permission check. Uses `iam:SimulatePrincipalPolicy` against the
# CURRENT caller to confirm the IAM User/Role running deploy.sh holds the
# actions the deployment performs (CloudFormation + the CodeBuild role it
# creates/bootstraps + every service the CDK stacks provision). Nothing is
# created — this is a read-only simulation.
#
# Why simulate the caller: the heavy work runs inside a CodeBuild role that
# deploy.sh creates and bootstraps, but the caller is what creates that role,
# passes it, and bootstraps — so the caller must itself hold these actions
# (SCP / permission-boundary limits also surface here).
#
# Exit 0 = all allowed. Exit 2 = some denied (caller decides). Exit 1 =
# couldn't run the check (e.g. no simulate permission).
#
# Usage: preflight.sh [REGION]
#
set -uo pipefail
REGION="${1:-${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-2}}}"

CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null) || {
  echo "preflight: cannot call sts:GetCallerIdentity — are credentials configured?" >&2
  exit 1
}
# Simulation must target a user/role ARN. Assumed-role ARNs
# (arn:aws:sts::acct:assumed-role/Name/session) need converting to the role
# ARN (arn:aws:iam::acct:role/Name).
PRINCIPAL_ARN="$CALLER_ARN"
if [[ "$CALLER_ARN" == *":assumed-role/"* ]]; then
  ACCT=$(echo "$CALLER_ARN" | cut -d: -f5)
  ROLE_NAME=$(echo "$CALLER_ARN" | sed -E 's#.*:assumed-role/([^/]+)/.*#\1#')
  PRINCIPAL_ARN="arn:aws:iam::${ACCT}:role/${ROLE_NAME}"
fi

echo "Preflight permission check"
echo "  Caller:    $CALLER_ARN"
echo "  Simulated: $PRINCIPAL_ARN"
echo "  Region:    $REGION"
echo ""

# Write/create actions the OCR Vision Lab deploy actually exercises. Read-only
# describes are omitted — these are the ones that gate the deploy.
ACTIONS=(
  # CloudFormation + CDK bootstrap
  cloudformation:CreateStack cloudformation:DeleteStack cloudformation:DescribeStacks
  # IAM — create + pass the CodeBuild role and every stack role
  iam:CreateRole iam:DeleteRole iam:AttachRolePolicy iam:PutRolePolicy
  iam:CreatePolicy iam:CreateServiceLinkedRole iam:PassRole
  # Build + container pipeline
  codebuild:CreateProject codebuild:StartBuild
  ecr:CreateRepository ecr:GetAuthorizationToken ecr:PutImage
  # Storage + config
  s3:CreateBucket s3:PutObject ssm:PutParameter ssm:GetParameter
  logs:CreateLogGroup
  # ML inference
  sagemaker:CreateModel sagemaker:CreateEndpoint sagemaker:CreateEndpointConfig
  application-autoscaling:RegisterScalableTarget
  # API + auth
  apigateway:POST lambda:CreateFunction
  cognito-idp:CreateUserPool cognito-identity:CreateIdentityPool
  # Frontend delivery (CloudFront + WAF in us-east-1)
  cloudfront:CreateDistribution wafv2:CreateWebACL
)

# Run the simulation. If SimulatePrincipalPolicy itself is denied we can't
# verify — warn and let the caller decide.
RESULT=$(aws iam simulate-principal-policy \
  --policy-source-arn "$PRINCIPAL_ARN" \
  --action-names "${ACTIONS[@]}" \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
  --output text 2>/tmp/preflight_err)
if [[ $? -ne 0 ]]; then
  echo "preflight: could not run simulate-principal-policy:" >&2
  sed 's/^/  /' /tmp/preflight_err >&2
  echo "" >&2
  echo "  This usually means the caller lacks iam:SimulatePrincipalPolicy," >&2
  echo "  not that the deploy will fail. Re-run deploy.sh with --skip-preflight" >&2
  echo "  to bypass this check." >&2
  exit 1
fi

DENIED=()
while IFS=$'\t' read -r action decision; do
  [[ -z "$action" ]] && continue
  if [[ "$decision" == "allowed" ]]; then
    printf '  [ok]   %s\n' "$action"
  else
    printf '  [DENY] %s (%s)\n' "$action" "$decision"
    DENIED+=("$action")
  fi
done <<< "$RESULT"

echo ""
if [[ ${#DENIED[@]} -eq 0 ]]; then
  echo "Preflight passed — all ${#ACTIONS[@]} checked actions are allowed."
  exit 0
fi

echo "Preflight found ${#DENIED[@]} denied action(s):"
printf '  - %s\n' "${DENIED[@]}"
echo ""
echo "The deploy will likely fail mid-build. Ask the account owner to grant"
echo "these to the deploy principal. Note: a deny can also come from an SCP"
echo "or permission boundary."
exit 2
