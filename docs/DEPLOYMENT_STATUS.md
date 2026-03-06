# Deployment Status

## AWS Infrastructure ✅ DEPLOYED

Deployment completed on: 2026-02-04

### Resources Created

#### ECR Repository ✅
- **URI**: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
- **Features**: Scan on push, lifecycle policy (keep 30 images), mutable tags
- **Tags**: TR required tags applied

#### Secrets Manager (3 secrets) ✅
- **Sandbox**: `arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/sandbox-tUc2se`
- **Dev**: `arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/dev-Pdht6a`
- **Staging**: `arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/staging-YB3w2h`

**Status**:
- ✅ Sandbox: Populated with credentials from .env (Port auth verified)
- ⚠️ Dev: Empty - needs credentials
- ⚠️ Staging: Empty - needs credentials

#### IAM Roles with IRSA (3 roles) ✅
- **Sandbox**: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-sandbox`
- **Dev**: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-dev`
- **Staging**: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-staging`

**Features**:
- OIDC trust policy for EKS cluster
- Permissions boundary attached: `arn:aws:iam::992398098861:policy/tr-permission-boundary`
- Inline policy for Secrets Manager access
- TR required tags applied

## Deployment Method

Due to CloudFormation permissions limitations, resources were created directly using AWS CLI instead of CloudFormation stacks. All resources follow the exact specifications from the CloudFormation templates.

## Next Steps

### 1. Populate Secrets

**Sandbox**: ✅ COMPLETE - Populated from .env file (Port auth verified)

**Dev and Staging**: ⏳ TODO - Need credentials

Each secret needs Port and GitHub App credentials:

```bash
# Get credentials from:
# - Port: https://app.getport.io → Settings → Credentials
# - GitHub App: GitHub org → Settings → Developer settings → GitHub Apps

# Example for sandbox:
cat > sandbox-secrets.json <<EOF
{
  "PORT_CLIENT_ID": "your_port_client_id",
  "PORT_CLIENT_SECRET": "your_port_client_secret",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "987654",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----"
}
EOF

AWS_PROFILE=tr-idp-preprod aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secrets.json

# Repeat for dev and staging
```

### 2. Build and Push Container Image ⏳ PENDING

#### Option A: Manual Build (Quick Start)

```bash
# Login to ECR
AWS_PROFILE=tr-idp-preprod aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 992398098861.dkr.ecr.us-east-1.amazonaws.com

# Build multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:$(git rev-parse --short HEAD) \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:latest \
  --push .
```

#### Option B: GitHub Actions (Recommended for Production)

1. Create GitHub Actions IAM roles (for OIDC)
2. Configure GitHub Environments (dev, staging)
3. Push to main branch → Automatic build and push

### 3. Deploy to Kubernetes ⏳ PENDING

#### Sandbox Deployment (First)

```bash
# Update kubeconfig
AWS_PROFILE=tr-idp-preprod aws eks update-kubeconfig \
  --region us-east-1 \
  --name a209567-preprod-idp-useast1-plexus-cluster

# Deploy with Helm
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n 209530-idp-sandbox \
  --set image.tag=latest \
  --create-namespace \
  --wait

# Verify deployment
kubectl get cronjob github-metrics -n 209530-idp-sandbox
kubectl get secretproviderclass -n 209530-idp-sandbox
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox

# Check secret keys synced
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox \
  -o jsonpath='{.data}' | jq 'keys'

# Expected: ["PORT_CLIENT_ID", "PORT_CLIENT_SECRET", "X_GITHUB_APP_ID", "X_GITHUB_APP_INSTALLATION_ID", "X_GITHUB_APP_PRIVATE_KEY"]
```

#### Trigger Test Job

```bash
# Create manual job
kubectl create job --from=cronjob/github-metrics github-metrics-test \
  -n 209530-idp-sandbox

# Watch logs
kubectl logs job/github-metrics-test -n 209530-idp-sandbox -f
```

#### Deploy to Dev and Staging

After sandbox verification:

```bash
# Dev
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-dev.yaml \
  -n 209530-idp-dev \
  --set image.tag=<SHA> \
  --create-namespace \
  --wait

# Staging
helm upgrade --install github-metrics ./k8s/github-metrics \
  -f k8s/github-metrics/values-staging.yaml \
  -n 209530-idp-staging \
  --set image.tag=<SHA> \
  --create-namespace \
  --wait
```

### 4. Verify Metrics in Port ⏳ PENDING

After first successful run:

1. Login to Port: https://app.getport.io
2. Navigate to **Builder** → **Blueprints**
3. Check for data in:
   - `serviceMetrics`
   - `serviceTimeSeriesMetrics`
   - `githubPullRequest` (updated metrics)
   - `githubWorkflow` (updated metrics)

## Verification Commands

### Check All Resources

```bash
# ECR repository
AWS_PROFILE=tr-idp-preprod aws ecr describe-repositories \
  --region us-east-1 \
  --repository-names github-metrics

# Secrets
AWS_PROFILE=tr-idp-preprod aws secretsmanager list-secrets \
  --region us-east-1 \
  --filters Key=name,Values=a209530/github-metrics

# IAM roles
AWS_PROFILE=tr-idp-preprod aws iam list-roles \
  --query 'Roles[?contains(RoleName, `github-metrics`)]'

# Check Kubernetes resources (after deployment)
kubectl get all -n 209530-idp-sandbox -l app.kubernetes.io/name=github-metrics
```

## Troubleshooting

### Issue: Secret not syncing to Kubernetes

```bash
# Check SecretProviderClass
kubectl describe secretproviderclass github-metrics-secrets -n 209530-idp-sandbox

# Check IRSA annotation
kubectl get serviceaccount github-metrics -n 209530-idp-sandbox -o yaml | grep eks.amazonaws.com/role-arn

# Verify IAM role trust policy
AWS_PROFILE=tr-idp-preprod aws iam get-role \
  --role-name a209530-github-metrics-secrets-sandbox
```

### Issue: Authentication errors

```bash
# Test Port credentials
PORT_CLIENT_ID="your_id"
PORT_CLIENT_SECRET="your_secret"

curl -X POST https://api.getport.io/v1/auth/access_token \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"${PORT_CLIENT_ID}\",\"clientSecret\":\"${PORT_CLIENT_SECRET}\"}"

# Should return: {"ok":true,"accessToken":"..."}
```

## CloudFormation Templates

Although resources were created via AWS CLI, the CloudFormation templates are available for reference and documentation:

- `cloudformation/ecr.yaml`
- `cloudformation/secrets-manager.yaml`
- `cloudformation/iam-irsa.yaml`

These templates can be used in environments where CloudFormation permissions are available.

## Deployment Summary

| Resource | Status | ARN/URI |
|----------|--------|---------|
| ECR Repository | ✅ Created | 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics |
| Sandbox Secret | ✅ Created | arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/sandbox-tUc2se |
| Dev Secret | ✅ Created | arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/dev-Pdht6a |
| Staging Secret | ✅ Created | arn:aws:secretsmanager:us-east-1:992398098861:secret:a209530/github-metrics/staging-YB3w2h |
| Sandbox IAM Role | ✅ Created | arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-sandbox |
| Dev IAM Role | ✅ Created | arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-dev |
| Staging IAM Role | ✅ Created | arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-staging |

## References

- [Complete Deployment Guide](DEPLOYMENT.md)
- [CloudFormation Documentation](cloudformation/README.md)
- [GitHub Actions CI/CD](.github/workflows/README.md)
- [Helm Chart Documentation](k8s/github-metrics/README.md)
