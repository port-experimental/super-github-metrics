# GitHub Metrics Kubernetes Deployment

This directory contains Kubernetes deployment configurations for the GitHub metrics collection system.

## Overview

The GitHub metrics collection runs as a Kubernetes CronJob that executes four metrics commands daily at midnight UTC:

1. `service-metrics` - Collect service-level metrics
2. `timeseries-service-metrics` - Collect time-series service metrics
3. `pr-metrics` - Collect pull request metrics
4. `workflow-metrics` - Collect GitHub Actions workflow metrics

## Directory Structure

```
k8s/
├── github-metrics/           # Helm chart for CronJob
│   ├── Chart.yaml
│   ├── values.yaml           # Base values
│   ├── values-sandbox.yaml   # Sandbox environment
│   ├── values-dev.yaml       # Dev environment
│   ├── values-staging.yaml   # Staging environment
│   └── templates/
│       ├── _helpers.tpl
│       ├── cronjob.yaml
│       ├── configmap.yaml
│       ├── serviceaccount.yaml
│       └── secretproviderclass.yaml
└── argocd/
    └── applications/         # ArgoCD ApplicationSet
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
            └── applicationset.yaml
```

## Prerequisites

### 1. AWS Secrets Manager

Create secrets in AWS Secrets Manager for each environment:

**Secret path format**: `a209530/github-metrics/{environment}`

**Secret content** (JSON):

```json
{
  "PORT_CLIENT_ID": "your_port_client_id",
  "PORT_CLIENT_SECRET": "your_port_client_secret",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "98765432",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
}
```

### 2. IAM Roles (IRSA)

Create IAM roles for each environment with:

**Naming convention**: `a209530-github-metrics-secrets`

**Required tags**:

- `tr:application-asset-insight-id: 209530`
- `tr:resource-owner: eamon.mason@thomsonreuters.com`

**Permissions boundary**: `arn:aws:iam::ACCOUNT_ID:policy/tr-permission-boundary`

**Policy**: Allow `secretsmanager:GetSecretValue` for the secret ARN

### 3. AWS Secrets Manager CSI Driver

The cluster must have the AWS Secrets Manager CSI Driver installed.

### 4. ECR Repositories

Create ECR repositories in each AWS account:

- Sandbox: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
- Dev: `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
- Staging: `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/github-metrics`

## Building and Pushing Container Images

### Build Multi-Architecture Image

From the project root:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 992398098861.dkr.ecr.us-east-1.amazonaws.com

# Build and push for sandbox
docker buildx build --platform linux/amd64,linux/arm64 \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:sandbox \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:latest \
  --push .

# For dev environment
docker buildx build --platform linux/amd64,linux/arm64 \
  -t DEV_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/github-metrics:dev \
  --push .

# For staging environment
docker buildx build --platform linux/amd64,linux/arm64 \
  -t STAGING_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/github-metrics:staging \
  --push .
```

## Local Testing

### Test Container Locally

```bash
# Build locally
docker build -t github-metrics:local .

# Run with environment variables
docker run --rm \
  -e PORT_CLIENT_ID="test" \
  -e PORT_CLIENT_SECRET="test" \
  -e PORT_BASE_URL="https://api.getport.io/v1" \
  -e X_GITHUB_ORGS="test-org" \
  -e X_GITHUB_APP_ID="123" \
  -e X_GITHUB_APP_INSTALLATION_ID="456" \
  -e X_GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)" \
  github-metrics:local
```

### Validate Helm Chart

```bash
# Lint chart
helm lint k8s/github-metrics

# Dry-run for sandbox
helm template github-metrics k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  --debug

# Validate generated YAML
helm template github-metrics k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml | \
  kubectl apply --dry-run=client -f -
```

## Deployment

### Manual Helm Deployment

```bash
# Deploy to sandbox
helm upgrade --install github-metrics k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n github-metrics-sandbox \
  --create-namespace

# Check CronJob
kubectl get cronjobs -n github-metrics-sandbox

# Trigger manual job for testing
kubectl create job --from=cronjob/github-metrics github-metrics-manual \
  -n github-metrics-sandbox

# Check job status
kubectl get jobs -n github-metrics-sandbox
kubectl logs job/github-metrics-manual -n github-metrics-sandbox -f
```

### ArgoCD ApplicationSet Deployment

1. Update `k8s/argocd/applications/values.yaml` with your cluster details
2. Deploy the ApplicationSet:

```bash
helm upgrade --install github-metrics-apps k8s/argocd/applications \
  -n argocd \
  --create-namespace
```

This will automatically deploy to all configured environments.

## Monitoring

### Check CronJob Status

```bash
# View CronJob
kubectl get cronjob github-metrics -n github-metrics-sandbox

# View recent Jobs
kubectl get jobs -n github-metrics-sandbox

# View Job logs
kubectl logs job/github-metrics-XXXXX -n github-metrics-sandbox
```

### Verify Metrics in Port

After a successful run, check Port for:

- Updated `serviceMetrics` entities
- Updated `serviceTimeSeriesMetrics` entities
- New/updated PR entities with metrics
- New/updated workflow entities with metrics

## Configuration

### Environment Variables

Configuration is split between ConfigMap (non-sensitive) and Secrets (sensitive):

**ConfigMap** (`configmap.yaml`):

- `PORT_BASE_URL`
- `X_GITHUB_ORGS`
- `X_GITHUB_REPOS` (optional)
- `X_GITHUB_ENTERPRISE` (optional)
- Blueprint configurations
- Logging settings

**Secrets** (AWS Secrets Manager via CSI):

- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `X_GITHUB_APP_ID`
- `X_GITHUB_APP_INSTALLATION_ID`
- `X_GITHUB_APP_PRIVATE_KEY`

### CronJob Schedule

Default: `0 0 * * *` (daily at midnight UTC)

To change, update `cronjob.schedule` in values files.

### Resource Limits

Default limits:

- CPU: 500m request, 2000m limit
- Memory: 1Gi request, 4Gi limit

Adjust in values files based on actual usage.

## Troubleshooting

### Job Fails Immediately

Check secret mounting:

```bash
kubectl describe secretproviderclass github-metrics-spc -n github-metrics-sandbox
kubectl get secret github-metrics-secrets -n github-metrics-sandbox
```

### Authentication Errors

Verify AWS Secrets Manager secret content and IAM role permissions.

### Out of Memory

Increase memory limits in environment-specific values files.

### Failed Metrics Collection

Check job logs:

```bash
kubectl logs job/github-metrics-XXXXX -n github-metrics-sandbox
```

Look for specific command failures in the sequential output.

## Security

- Container runs as non-root user (UID 65532)
- Read-only root filesystem (where possible)
- Drops all capabilities
- Uses seccomp profile
- Secrets managed via AWS Secrets Manager CSI Driver
- IRSA for AWS authentication (no long-lived credentials)

## Maintenance

### Updating Container Image

1. Build and push new image with tag
2. Update `image.tag` in environment values file
3. ArgoCD will auto-sync (or trigger manually)

### Changing Schedule

Update `cronjob.schedule` in values files and redeploy.

### Cleanup

Jobs are automatically cleaned up after 24 hours (`ttlSecondsAfterFinished: 86400`).
