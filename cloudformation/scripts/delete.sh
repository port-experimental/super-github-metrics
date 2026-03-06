#!/bin/bash
set -e

# Delete all CloudFormation stacks for GitHub Metrics
echo "⚠️  WARNING: This will delete all GitHub Metrics infrastructure!"
echo ""
read -p "Are you sure? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

AWS_PROFILE="${AWS_PROFILE:-tr-idp-preprod}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo ""
echo "🗑️  Deleting CloudFormation stacks..."

# Delete in reverse order (IAM -> Secrets -> ECR)
echo ""
echo "Step 1/3: Deleting IAM roles..."
aws cloudformation delete-stack \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam

echo "Waiting for IAM stack deletion..."
aws cloudformation wait stack-delete-complete \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam 2>/dev/null || true

echo "✅ IAM roles deleted"

echo ""
echo "Step 2/3: Deleting Secrets Manager secrets..."
aws cloudformation delete-stack \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets

echo "Waiting for Secrets stack deletion..."
aws cloudformation wait stack-delete-complete \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets 2>/dev/null || true

echo "✅ Secrets deleted"

echo ""
echo "Step 3/3: Deleting ECR repository..."
echo "⚠️  Note: ECR repository must be empty. Deleting all images first..."

# Get repository name
REPO_NAME=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-ecr \
  --query 'Stacks[0].Outputs[?OutputKey==`RepositoryName`].OutputValue' \
  --output text 2>/dev/null || echo "github-metrics")

# Delete all images
aws ecr list-images \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --repository-name "$REPO_NAME" \
  --query 'imageIds[*]' \
  --output json | \
jq -r '.[] | "\(.imageDigest)"' | \
while read -r digest; do
  if [ -n "$digest" ]; then
    aws ecr batch-delete-image \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --repository-name "$REPO_NAME" \
      --image-ids imageDigest="$digest" > /dev/null
  fi
done 2>/dev/null || true

# Delete stack
aws cloudformation delete-stack \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-ecr

echo "Waiting for ECR stack deletion..."
aws cloudformation wait stack-delete-complete \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-ecr 2>/dev/null || true

echo "✅ ECR repository deleted"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ All stacks deleted successfully"
echo "═══════════════════════════════════════════════════════"
