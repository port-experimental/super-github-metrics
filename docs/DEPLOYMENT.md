# GitHub Metrics Deployment Guide

Complete end-to-end guide for deploying GitHub Metrics CronJob to tr-idp-preprod Kubernetes cluster.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [Populate Secrets](#populate-secrets)
- [Build and Deploy](#build-and-deploy)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Overview

**Target Infrastructure**:

- **AWS Account**: `tr-idp-preprod` (992398098861)
- **Region**: `us-east-1`
- **EKS Cluster**: `a209567-preprod-idp-useast1-plexus-cluster`
- **Namespaces**:
  - Sandbox: `209530-idp-sandbox`
  - Dev: `209530-idp-dev`
  - Staging: `209530-idp-staging`

**Deployment Strategy**: Build once, promote everywhere

1. Build multi-arch image (amd64 + arm64)
2. Tag with git SHA + latest
3. Push to ECR once
4. Promote same image to dev/staging

## Prerequisites

### Local Tools

- AWS CLI configured with `tr-idp-preprod` profile
- kubectl
- Helm 3
- Docker with Buildx (for multi-arch builds)
- jq (for JSON processing)

### AWS Permissions

Your IAM user/role must have:

- CloudFormation: Create/update/delete stacks
- ECR: Create repository, push images
- Secrets Manager: Create/update secrets
- IAM: Create roles with IRSA
- EKS: Describe cluster, update kubeconfig

### GitHub (for CI/CD)

- IAM roles for GitHub Actions OIDC
- GitHub Environments configured (dev, staging)
- Repository secrets configured

## Infrastructure Setup

### Step 1: Validate CloudFormation Templates

```bash
./cloudformation/scripts/validate.sh
```

Expected output:

```
Validating CloudFormation templates...
✓ Validating ecr.yaml...
✓ Validating secrets-manager.yaml...
✓ Validating iam-irsa.yaml...

✅ All templates are valid!
```

### Step 2: Deploy AWS Infrastructure

```bash
./cloudformation/scripts/deploy.sh
```

This creates:

1. **ECR Repository**: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
2. **Secrets Manager Secrets**:
   - `a209530/github-metrics/sandbox`
   - `a209530/github-metrics/dev`
   - `a209530/github-metrics/staging`
3. **IAM Roles with IRSA**:
   - `a209530-github-metrics-secrets-sandbox`
   - `a209530-github-metrics-secrets-dev`
   - `a209530-github-metrics-secrets-staging`

Expected output:

```
═══════════════════════════════════════════════════════
🎉 Deployment Complete!
═══════════════════════════════════════════════════════

📦 ECR Repository:
   992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics

🔐 Secrets Manager:
   Sandbox: arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/sandbox-xxxxx
   Dev:     arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/dev-xxxxx
   Staging: arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/staging-xxxxx

🔑 IAM Roles:
   Sandbox: arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-sandbox
   Dev:     arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-dev
   Staging: arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-staging
```

### Step 3: Verify Infrastructure

```bash
# Check ECR repository
aws ecr describe-repositories \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --repository-names github-metrics

# Check Secrets Manager secrets
aws secretsmanager list-secrets \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --filters Key=name,Values=a209530/github-metrics

# Check IAM roles
aws iam list-roles \
  --profile tr-idp-preprod \
  --query 'Roles[?contains(RoleName, `github-metrics`)].{Name:RoleName, Arn:Arn}'
```

## Populate Secrets

After CloudFormation creates empty secrets, populate them with actual credentials.

### Get Credentials

**Port Credentials**:

1. Login to Port: https://app.getport.io
2. Navigate to Settings → Credentials
3. Create new credentials or use existing
4. Copy `Client ID` and `Client Secret`

**GitHub App Credentials**:

1. Login to GitHub (organization settings)
2. Navigate to Settings → Developer settings → GitHub Apps
3. Find your GitHub App
4. Copy:
   - App ID
   - Installation ID
   - Private Key (download and format)

### Format Private Key

GitHub private key must be in single-line format with `\n`:

```bash
# If you have multiline private key file
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' github-app-private-key.pem
```

### Update Sandbox Secret

```bash
# Create secret JSON file
cat > sandbox-secrets.json <<EOF
{
  "PORT_CLIENT_ID": "your_port_client_id_here",
  "PORT_CLIENT_SECRET": "your_port_client_secret_here",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "987654",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA...\\n-----END RSA PRIVATE KEY-----"
}
EOF

# Update secret
aws secretsmanager put-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secrets.json

# Verify
aws secretsmanager get-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox \
  --query 'SecretString' \
  --output text | jq 'keys'

# Cleanup
rm sandbox-secrets.json
```

### Update Dev and Staging Secrets

Repeat the process for dev and staging environments with appropriate credentials:

```bash
# Dev
aws secretsmanager put-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/dev \
  --secret-string file://dev-secrets.json

# Staging
aws secretsmanager put-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/staging \
  --secret-string file://staging-secrets.json
```

## Build and Deploy

### Option 1: GitHub Actions (Recommended)

This is the recommended approach for production deployments.

#### Setup GitHub Actions

1. **Create IAM Roles for GitHub Actions** (see cloudformation/iam-github-actions.yaml - TBD)
2. **Configure GitHub Environments**:
   - `dev` - Add required reviewers
   - `staging` - Add required reviewers

#### Deploy via GitHub Actions

1. **Push to main** (triggers automatic build and sandbox deployment):

```bash
git push origin main
```

2. **Monitor build**:

```
GitHub → Actions → Build and Push
```

3. **Verify sandbox deployment**:

```bash
kubectl get cronjob github-metrics -n 209530-idp-sandbox
kubectl get pod -n 209530-idp-sandbox -l app.kubernetes.io/name=github-metrics
```

4. **Deploy to dev** (manual with approval):

```
GitHub → Actions → Deploy to Dev → Run workflow
Input: image-tag = abc1234 (git SHA from build)
```

5. **Deploy to staging** (manual with approval):

```
GitHub → Actions → Deploy to Staging → Run workflow
Input: image-tag = abc1234 (same SHA as dev)
```

### Option 2: Manual Deployment

If GitHub Actions is not available, deploy manually.

#### 1. Build Multi-Arch Image

```bash
# Login to ECR
aws ecr get-login-password --profile tr-idp-preprod --region us-east-1 | \
  docker login --username AWS --password-stdin 992398098861.dkr.ecr.us-east-1.amazonaws.com

# Build and push multi-arch image
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_URI="992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics"

docker buildx build --platform linux/amd64,linux/arm64 \
  -t ${IMAGE_URI}:${GIT_SHA} \
  -t ${IMAGE_URI}:latest \
  --push .

echo "Image built and pushed: ${IMAGE_URI}:${GIT_SHA}"
```

#### 2. Deploy to Sandbox

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --name a209567-preprod-idp-useast1-plexus-cluster

# Deploy with Helm
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n 209530-idp-sandbox \
  --set image.tag=${GIT_SHA} \
  --create-namespace \
  --wait

echo "Deployed to sandbox"
```

#### 3. Verify Sandbox Deployment

```bash
# Check CronJob
kubectl get cronjob github-metrics -n 209530-idp-sandbox

# Check SecretProviderClass
kubectl get secretproviderclass -n 209530-idp-sandbox

# Check Secret
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox

# Verify secret keys
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data}' | jq 'keys'

# Expected: ["PORT_CLIENT_ID", "PORT_CLIENT_SECRET", "X_GITHUB_APP_ID", "X_GITHUB_APP_INSTALLATION_ID", "X_GITHUB_APP_PRIVATE_KEY"]
```

#### 4. Trigger Test Job

```bash
# Create job from CronJob
kubectl create job --from=cronjob/github-metrics github-metrics-test \
  -n 209530-idp-sandbox

# Wait for job to start
sleep 10

# Watch logs
kubectl logs job/github-metrics-test -n 209530-idp-sandbox -f
```

#### 5. Deploy to Dev

```bash
# Same image, different environment
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-dev.yaml \
  -n 209530-idp-dev \
  --set image.tag=${GIT_SHA} \
  --create-namespace \
  --wait
```

#### 6. Deploy to Staging

```bash
# Same image, different environment
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-staging.yaml \
  -n 209530-idp-staging \
  --set image.tag=${GIT_SHA} \
  --create-namespace \
  --wait
```

## Verification

### Check Deployment Status

```bash
# All environments
kubectl get cronjob -A -l app.kubernetes.io/name=github-metrics

# Specific environment
kubectl get all -n 209530-idp-sandbox -l app.kubernetes.io/name=github-metrics
```

### Check Secrets Sync

```bash
# Check SecretProviderClass
kubectl describe secretproviderclass github-metrics-secrets -n 209530-idp-sandbox

# Check synced secret
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o yaml

# Verify all keys present
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data}' | jq 'keys'
```

### Trigger Manual Job

```bash
# Create test job
kubectl create job --from=cronjob/github-metrics test-$(date +%s) \
  -n 209530-idp-sandbox

# Wait for job
kubectl wait --for=condition=complete job/test-* -n 209530-idp-sandbox --timeout=600s

# View logs
kubectl logs job/test-* -n 209530-idp-sandbox
```

### Check Metrics in Port

1. Login to Port: https://app.getport.io
2. Navigate to **Builder** → **Blueprints**
3. Check blueprints:
   - `serviceMetrics`
   - `serviceTimeSeriesMetrics`
   - `githubPullRequest` (with updated metrics)
   - `githubWorkflow` (with updated metrics)

## Troubleshooting

### Issue: Secret not syncing to Kubernetes

**Symptoms**:

- `kubectl get secret github-metrics-secrets` returns "NotFound"
- Pod logs show authentication errors

**Solution**:

```bash
# Check SecretProviderClass
kubectl get secretproviderclass -n 209530-idp-sandbox
kubectl describe secretproviderclass github-metrics-secrets -n 209530-idp-sandbox

# Check IRSA annotation
kubectl get serviceaccount github-metrics -n 209530-idp-sandbox -o yaml | grep eks.amazonaws.com/role-arn

# Verify IAM role trust policy
aws iam get-role --role-name a209530-github-metrics-secrets-sandbox --profile tr-idp-preprod

# Check if secret exists in AWS
aws secretsmanager get-secret-value \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox
```

### Issue: CronJob not running

**Symptoms**:

- No jobs created
- CronJob shows "0 active"

**Solution**:

```bash
# Check CronJob status
kubectl describe cronjob github-metrics -n 209530-idp-sandbox

# Check if suspended
kubectl get cronjob github-metrics -n 209530-idp-sandbox -o jsonpath='{.spec.suspend}'

# Resume if suspended
kubectl patch cronjob github-metrics -n 209530-idp-sandbox -p '{"spec":{"suspend":false}}'
```

### Issue: Job fails with "ImagePullBackOff"

**Symptoms**:

- Pod status: ImagePullBackOff
- Cannot pull image from ECR

**Solution**:

```bash
# Check imagePullSecrets
kubectl get serviceaccount github-metrics -n 209530-idp-sandbox -o yaml

# Verify ECR image exists
aws ecr describe-images \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --repository-name github-metrics \
  --image-ids imageTag=latest

# Check node can pull from ECR (should be automatic with worker node IAM role)
```

### Issue: Authentication errors in logs

**Symptoms**:

- Logs show "401 Unauthorized" or "403 Forbidden"
- Cannot connect to Port or GitHub

**Solution**:

```bash
# Verify secret values
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data.PORT_CLIENT_ID}' | base64 -d

# Test Port credentials
PORT_CLIENT_ID=$(kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data.PORT_CLIENT_ID}' | base64 -d)
PORT_CLIENT_SECRET=$(kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data.PORT_CLIENT_SECRET}' | base64 -d)

curl -X POST https://api.getport.io/v1/auth/access_token \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"${PORT_CLIENT_ID}\",\"clientSecret\":\"${PORT_CLIENT_SECRET}\"}"

# Should return: {"ok":true,"accessToken":"..."}
```

### Issue: Job completes but no metrics in Port

**Symptoms**:

- Job completes successfully
- No errors in logs
- Metrics not appearing in Port

**Solution**:

```bash
# Check all 4 commands executed
kubectl logs job/github-metrics-test -n 209530-idp-sandbox | grep -E "(service-metrics|timeseries-service-metrics|pr-metrics|workflow-metrics)"

# Check for any errors
kubectl logs job/github-metrics-test -n 209530-idp-sandbox | grep -i error

# Check blueprints exist in Port
curl -X GET https://api.getport.io/v1/blueprints \
  -H "Authorization: Bearer ${PORT_ACCESS_TOKEN}"
```

## Rollback

### Rollback Helm Release

```bash
# List releases
helm list -n 209530-idp-sandbox

# Rollback to previous
helm rollback github-metrics -n 209530-idp-sandbox

# Or rollback to specific revision
helm rollback github-metrics 2 -n 209530-idp-sandbox
```

### Deploy Previous Image

```bash
# List available images
aws ecr describe-images \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --repository-name github-metrics \
  --query 'sort_by(imageDetails,&imagePushedAt)[-5:]' \
  --output table

# Deploy specific SHA
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n 209530-idp-sandbox \
  --set image.tag=previous-sha \
  --wait
```

## Cleanup

### Delete Kubernetes Resources

```bash
# Delete Helm release
helm uninstall github-metrics -n 209530-idp-sandbox

# Delete namespace (if empty)
kubectl delete namespace 209530-idp-sandbox
```

### Delete AWS Infrastructure

```bash
./cloudformation/scripts/delete.sh
```

This will delete:

1. IAM roles
2. Secrets Manager secrets
3. ECR repository (after deleting all images)

## Next Steps

- **Set up monitoring**: Configure alerts for job failures
- **Set up log aggregation**: Ship logs to centralized logging
- **Tune resource limits**: Adjust based on actual usage
- **Configure GitHub Environments**: Add approvers for dev/staging
- **Document runbooks**: Create incident response procedures

## References

- [CloudFormation README](cloudformation/README.md)
- [GitHub Actions README](.github/workflows/README.md)
- [Helm Chart README](k8s/github-metrics/README.md)
- [AWS Setup Guide](k8s/AWS_SETUP.md)
- [Kubernetes Deployment Guide](KUBERNETES_DEPLOYMENT.md)
