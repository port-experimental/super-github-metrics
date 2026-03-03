#!/bin/bash
set -e

# Deploy all CloudFormation stacks for GitHub Metrics
echo "Deploying GitHub Metrics CloudFormation stacks..."

AWS_PROFILE="${AWS_PROFILE:-tr-idp-preprod}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PARAM_FILE="cloudformation/parameters/preprod.json"

# Step 1: Deploy ECR repository
echo ""
echo "📦 Step 1/3: Deploying ECR repository..."
aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-ecr \
  --template-file cloudformation/ecr.yaml \
  --no-fail-on-empty-changeset

echo "✅ ECR repository deployed"

# Step 2: Deploy Secrets Manager secrets
echo ""
echo "🔐 Step 2/3: Deploying Secrets Manager secrets..."
aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets \
  --template-file cloudformation/secrets-manager.yaml \
  --no-fail-on-empty-changeset

echo "✅ Secrets Manager secrets deployed"

# Get secret ARNs from outputs
SANDBOX_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSecretArn`].OutputValue' \
  --output text)

DEV_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`DevSecretArn`].OutputValue' \
  --output text)

STAGING_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' \
  --output text)

# Step 3: Deploy IAM roles with IRSA
echo ""
echo "🔑 Step 3/3: Deploying IAM roles with IRSA..."

# Build parameters array with secret ARNs
PARAMETERS=$(cat "$PARAM_FILE" | jq --arg sandbox "$SANDBOX_SECRET_ARN" --arg dev "$DEV_SECRET_ARN" --arg staging "$STAGING_SECRET_ARN" \
  '. + [
    {"ParameterKey": "SandboxSecretArn", "ParameterValue": $sandbox},
    {"ParameterKey": "DevSecretArn", "ParameterValue": $dev},
    {"ParameterKey": "StagingSecretArn", "ParameterValue": $staging}
  ]')

# Write temporary parameters file
echo "$PARAMETERS" > /tmp/iam-params.json

aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam \
  --template-file cloudformation/iam-irsa.yaml \
  --parameter-overrides file:///tmp/iam-params.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset

# Cleanup
rm /tmp/iam-params.json

echo "✅ IAM roles deployed"

# Display outputs
echo ""
echo "═══════════════════════════════════════════════════════"
echo "🎉 Deployment Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""

# Get ECR repository URI
ECR_URI=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-ecr \
  --query 'Stacks[0].Outputs[?OutputKey==`RepositoryUri`].OutputValue' \
  --output text)

# Get IAM role ARNs
SANDBOX_ROLE=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxRoleArn`].OutputValue' \
  --output text)

DEV_ROLE=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`DevRoleArn`].OutputValue' \
  --output text)

STAGING_ROLE=$(aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name github-metrics-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingRoleArn`].OutputValue' \
  --output text)

echo "📦 ECR Repository:"
echo "   $ECR_URI"
echo ""
echo "🔐 Secrets Manager:"
echo "   Sandbox: $SANDBOX_SECRET_ARN"
echo "   Dev:     $DEV_SECRET_ARN"
echo "   Staging: $STAGING_SECRET_ARN"
echo ""
echo "🔑 IAM Roles:"
echo "   Sandbox: $SANDBOX_ROLE"
echo "   Dev:     $DEV_ROLE"
echo "   Staging: $STAGING_ROLE"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📝 Next Steps:"
echo "1. Populate secrets with actual credentials:"
echo "   ./cloudformation/scripts/populate-secrets.sh"
echo ""
echo "2. Build and push container image:"
echo "   docker buildx build --platform linux/amd64,linux/arm64 \\"
echo "     -t $ECR_URI:latest --push ."
echo ""
echo "3. Deploy to Kubernetes:"
echo "   helm upgrade --install github-metrics ./k8s/github-metrics \\"
echo "     -f k8s/github-metrics/values-sandbox.yaml \\"
echo "     -n 209530-idp-sandbox --wait"
echo ""
