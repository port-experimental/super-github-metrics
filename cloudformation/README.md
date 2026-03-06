# CloudFormation Infrastructure for GitHub Metrics

This directory contains CloudFormation templates and scripts to deploy AWS infrastructure for the GitHub Metrics CronJob.

## Overview

The infrastructure consists of three stacks:

1. **ECR Repository** (`ecr.yaml`) - Container image repository
2. **Secrets Manager** (`secrets-manager.yaml`) - Secrets for each environment (sandbox, dev, staging)
3. **IAM Roles with IRSA** (`iam-irsa.yaml`) - Service account roles for Kubernetes

## Prerequisites

- AWS CLI configured with `tr-idp-preprod` profile
- Permissions to create CloudFormation stacks, ECR repositories, Secrets Manager secrets, and IAM roles
- `jq` installed for JSON processing

## Quick Start

### Validate Templates

```bash
./cloudformation/scripts/validate.sh
```

### Deploy All Stacks

```bash
./cloudformation/scripts/deploy.sh
```

This will:

1. Create ECR repository: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
2. Create three Secrets Manager secrets (initially empty):
   - `a209530/github-metrics/sandbox`
   - `a209530/github-metrics/dev`
   - `a209530/github-metrics/staging`
3. Create three IAM roles with IRSA:
   - `a209530-github-metrics-secrets-sandbox`
   - `a209530-github-metrics-secrets-dev`
   - `a209530-github-metrics-secrets-staging`

### Populate Secrets

After deployment, populate secrets with actual credentials:

```bash
# Create secret JSON file
cat > sandbox-secrets.json <<EOF
{
  "PORT_CLIENT_ID": "your_port_client_id",
  "PORT_CLIENT_SECRET": "your_port_client_secret",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "987654",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
}
EOF

# Update secret
aws secretsmanager put-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secrets.json

# Repeat for dev and staging
```

### Delete All Stacks

```bash
./cloudformation/scripts/delete.sh
```

## Manual Deployment

If you prefer to deploy stacks individually:

### 1. Deploy ECR Repository

```bash
aws cloudformation deploy \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-ecr \
  --template-file cloudformation/ecr.yaml
```

### 2. Deploy Secrets Manager

```bash
aws cloudformation deploy \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-secrets \
  --template-file cloudformation/secrets-manager.yaml
```

### 3. Get Secret ARNs

```bash
SANDBOX_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSecretArn`].OutputValue' \
  --output text)

DEV_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`DevSecretArn`].OutputValue' \
  --output text)

STAGING_SECRET_ARN=$(aws cloudformation describe-stacks \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-secrets \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' \
  --output text)
```

### 4. Deploy IAM Roles

Create a temporary parameters file:

```bash
cat cloudformation/parameters/preprod.json | jq \
  --arg sandbox "$SANDBOX_SECRET_ARN" \
  --arg dev "$DEV_SECRET_ARN" \
  --arg staging "$STAGING_SECRET_ARN" \
  '. + [
    {"ParameterKey": "SandboxSecretArn", "ParameterValue": $sandbox},
    {"ParameterKey": "DevSecretArn", "ParameterValue": $dev},
    {"ParameterKey": "StagingSecretArn", "ParameterValue": $staging}
  ]' > /tmp/iam-params.json
```

Deploy:

```bash
aws cloudformation deploy \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-iam \
  --template-file cloudformation/iam-irsa.yaml \
  --parameter-overrides file:///tmp/iam-params.json \
  --capabilities CAPABILITY_NAMED_IAM
```

## Stack Details

### ECR Repository Stack

- **Stack Name**: `github-metrics-ecr`
- **Repository**: `github-metrics`
- **Features**:
  - Scan on push enabled
  - Lifecycle policy: Keep last 30 images
  - Encryption: AES256
  - Tags: TR required tags

### Secrets Manager Stack

- **Stack Name**: `github-metrics-secrets`
- **Secrets Created**:
  - `a209530/github-metrics/sandbox`
  - `a209530/github-metrics/dev`
  - `a209530/github-metrics/staging`
- **Secret Keys** (all initially empty):
  - `PORT_CLIENT_ID`
  - `PORT_CLIENT_SECRET`
  - `X_GITHUB_APP_ID`
  - `X_GITHUB_APP_INSTALLATION_ID`
  - `X_GITHUB_APP_PRIVATE_KEY`

### IAM IRSA Stack

- **Stack Name**: `github-metrics-iam`
- **Roles Created**:
  - `a209530-github-metrics-secrets-sandbox`
  - `a209530-github-metrics-secrets-dev`
  - `a209530-github-metrics-secrets-staging`
- **Features**:
  - IRSA trust policy with namespace condition
  - Secrets Manager read access
  - TR permissions boundary attached
  - TR required tags

## Parameters

Parameters are defined in `cloudformation/parameters/preprod.json`:

| Parameter | Value |
|-----------|-------|
| OIDCProviderArn | arn:aws:iam::992398098861:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3 |
| OIDCProvider | oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3 |
| PermissionsBoundaryArn | arn:aws:iam::992398098861:policy/tr-permission-boundary |
| ApplicationId | 209530 |
| ResourceOwner | eamon.mason@thomsonreuters.com |

Secret ARNs are automatically populated during deployment.

## Outputs

All stacks export their outputs for use by other stacks:

### ECR Stack Outputs

- `RepositoryUri`: Full ECR repository URI
- `RepositoryArn`: ECR repository ARN
- `RepositoryName`: Repository name

### Secrets Stack Outputs

- `SandboxSecretArn`: ARN of sandbox secret
- `DevSecretArn`: ARN of dev secret
- `StagingSecretArn`: ARN of staging secret

### IAM Stack Outputs

- `SandboxRoleArn`: ARN of sandbox IAM role
- `DevRoleArn`: ARN of dev IAM role
- `StagingRoleArn`: ARN of staging IAM role

## Troubleshooting

### Stack Creation Fails

Check CloudFormation console for detailed error messages:

```bash
aws cloudformation describe-stack-events \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --stack-name github-metrics-iam \
  --max-items 10
```

### IAM Role Trust Policy Issues

Verify OIDC provider exists:

```bash
aws iam get-open-id-connect-provider \
  --profile tr-idp-preprod \
  --open-id-connect-provider-arn arn:aws:iam::992398098861:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3
```

### Permissions Boundary Errors

Verify permissions boundary exists:

```bash
aws iam get-policy \
  --profile tr-idp-preprod \
  --policy-arn arn:aws:iam::992398098861:policy/tr-permission-boundary
```

### Secret Already Exists

If secrets already exist from manual creation:

```bash
# Delete existing secret
aws secretsmanager delete-secret \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox \
  --force-delete-without-recovery

# Redeploy stack
./cloudformation/scripts/deploy.sh
```

## Updating Stacks

To update existing stacks, simply re-run the deploy script:

```bash
./cloudformation/scripts/deploy.sh
```

CloudFormation will detect changes and create a change set automatically.

## Next Steps

After infrastructure is deployed:

1. **Populate secrets** with actual credentials
2. **Build container image** and push to ECR
3. **Deploy to Kubernetes** using Helm charts in `k8s/github-metrics/`

See main `DEPLOYMENT.md` for complete end-to-end deployment guide.
