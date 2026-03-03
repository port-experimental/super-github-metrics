#!/bin/bash
set -e

# Validate CloudFormation templates
echo "Validating CloudFormation templates..."

AWS_PROFILE="${AWS_PROFILE:-tr-idp-preprod}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Validate ECR template
echo "✓ Validating ecr.yaml..."
aws cloudformation validate-template \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --template-body file://cloudformation/ecr.yaml > /dev/null

# Validate Secrets Manager template
echo "✓ Validating secrets-manager.yaml..."
aws cloudformation validate-template \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --template-body file://cloudformation/secrets-manager.yaml > /dev/null

# Validate IAM IRSA template
echo "✓ Validating iam-irsa.yaml..."
aws cloudformation validate-template \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --template-body file://cloudformation/iam-irsa.yaml > /dev/null

echo ""
echo "✅ All templates are valid!"
