# Kubernetes Deployment Quickstart

Fast-track guide to deploy GitHub metrics collection to Kubernetes.

## Prerequisites Checklist

- [ ] Docker installed and configured
- [ ] kubectl configured for target cluster
- [ ] helm 3.x installed
- [ ] AWS CLI configured
- [ ] Access to create AWS resources (ECR, Secrets Manager, IAM)

## 1. AWS Setup (10 minutes)

### Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name github-metrics \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --tags Key=tr:application-asset-insight-id,Value=209530 \
         Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com
```

### Create Secret in Secrets Manager

Create `sandbox-secret.json`:

```json
{
  "PORT_CLIENT_ID": "your_port_client_id",
  "PORT_CLIENT_SECRET": "your_port_client_secret",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "987654",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
}
```

```bash
aws secretsmanager create-secret \
  --name a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secret.json \
  --region us-east-1 \
  --tags Key=tr:application-asset-insight-id,Value=209530 \
         Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com
```

### Create IAM Role for IRSA

Get your EKS cluster's OIDC provider:

```bash
CLUSTER_NAME="your-cluster-name"
ACCOUNT_ID="992398098861"

OIDC_PROVIDER=$(aws eks describe-cluster \
  --name $CLUSTER_NAME \
  --query "cluster.identity.oidc.issuer" \
  --output text | sed 's/https:\/\///')

echo $OIDC_PROVIDER
```

Create trust policy `trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/OIDC_PROVIDER"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "OIDC_PROVIDER:sub": "system:serviceaccount:github-metrics-sandbox:github-metrics",
          "OIDC_PROVIDER:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

Create policy `secrets-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:a209530/github-metrics/sandbox-*"
    }
  ]
}
```

Create IAM resources:

```bash
# Create policy
aws iam create-policy \
  --policy-name a209530-github-metrics-secrets-policy \
  --policy-document file://secrets-policy.json \
  --tags Key=tr:application-asset-insight-id,Value=209530 \
         Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com

# Create role
aws iam create-role \
  --role-name a209530-github-metrics-secrets \
  --assume-role-policy-document file://trust-policy.json \
  --permissions-boundary arn:aws:iam::${ACCOUNT_ID}:policy/tr-permission-boundary \
  --tags Key=tr:application-asset-insight-id,Value=209530 \
         Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com

# Attach policy
aws iam attach-role-policy \
  --role-name a209530-github-metrics-secrets \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/a209530-github-metrics-secrets-policy
```

## 2. Build and Push Container (5 minutes)

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/github-metrics:sandbox \
  -t ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/github-metrics:latest \
  --push .
```

## 3. Update Helm Values (2 minutes)

Edit `k8s/github-metrics/values-sandbox.yaml`:

```yaml
image:
  repository: "992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics"
  tag: "sandbox"

github:
  orgs: "your-org-name"  # ⬅️ UPDATE THIS

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::992398098861:role/a209530-github-metrics-secrets

secretProviderClass:
  enabled: true
  awsSecretName: "a209530/github-metrics/sandbox"
  secretName: "github-metrics-secrets"
```

## 4. Deploy to Kubernetes (2 minutes)

```bash
# Deploy with Helm
helm upgrade --install github-metrics k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n github-metrics-sandbox \
  --create-namespace

# Verify deployment
kubectl get cronjobs -n github-metrics-sandbox
kubectl get secretproviderclass -n github-metrics-sandbox
kubectl get secret github-metrics-secrets -n github-metrics-sandbox
```

## 5. Test Run (3 minutes)

```bash
# Trigger manual job
kubectl create job --from=cronjob/github-metrics github-metrics-test \
  -n github-metrics-sandbox

# Watch logs
kubectl logs job/github-metrics-test -n github-metrics-sandbox -f

# Check job status
kubectl get jobs -n github-metrics-sandbox
```

Expected output:

```
Starting GitHub metrics collection at Mon Feb 4 00:00:00 UTC 2026
=========================================
1/4 Running service-metrics...
=========================================
[metrics output...]
✓ service-metrics completed successfully

=========================================
2/4 Running timeseries-service-metrics...
=========================================
[metrics output...]
✓ timeseries-service-metrics completed successfully

=========================================
3/4 Running pr-metrics...
=========================================
[metrics output...]
✓ pr-metrics completed successfully

=========================================
4/4 Running workflow-metrics...
=========================================
[metrics output...]
✓ workflow-metrics completed successfully

=========================================
All metrics collection completed successfully at Mon Feb 4 00:05:23 UTC 2026
=========================================
```

## 6. Verify in Port (2 minutes)

Check Port UI for updated entities:

- [ ] `serviceMetrics` blueprint has new data
- [ ] `serviceTimeSeriesMetrics` blueprint has new data
- [ ] PR entities have updated metrics
- [ ] Workflow entities have updated metrics

## Troubleshooting

### Job Fails Immediately

```bash
# Check pod logs
kubectl get pods -n github-metrics-sandbox
kubectl logs <pod-name> -n github-metrics-sandbox

# Check secret mounting
kubectl describe secretproviderclass github-metrics-spc -n github-metrics-sandbox
```

### Authentication Errors

```bash
# Verify secret content
aws secretsmanager get-secret-value \
  --secret-id a209530/github-metrics/sandbox \
  --region us-east-1 \
  --query SecretString \
  --output text | jq .

# Check IAM role
aws iam get-role --role-name a209530-github-metrics-secrets
```

### Secrets Not Syncing

```bash
# Check SecretProviderClass events
kubectl describe secretproviderclass github-metrics-spc -n github-metrics-sandbox

# Check pod events
kubectl describe pod <pod-name> -n github-metrics-sandbox

# Verify service account annotation
kubectl get sa github-metrics -n github-metrics-sandbox -o yaml | grep eks.amazonaws.com/role-arn
```

## Next Steps

Once sandbox is working:

1. Repeat for dev environment with `values-dev.yaml`
2. Repeat for staging environment with `values-staging.yaml`
3. Set up ArgoCD ApplicationSet for GitOps deployment
4. Configure monitoring and alerting
5. Document operational procedures

## Useful Commands

```bash
# View CronJob details
kubectl get cronjob github-metrics -n github-metrics-sandbox -o yaml

# List all jobs (including completed)
kubectl get jobs -n github-metrics-sandbox

# Delete a job
kubectl delete job github-metrics-test -n github-metrics-sandbox

# Update secret in AWS
aws secretsmanager update-secret \
  --secret-id a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secret.json \
  --region us-east-1

# Force secret refresh (restart pod)
kubectl rollout restart cronjob github-metrics -n github-metrics-sandbox

# View logs from all runs
kubectl logs -l app.kubernetes.io/name=github-metrics -n github-metrics-sandbox --tail=100
```

## Schedule

Default schedule: `0 0 * * *` (daily at midnight UTC)

To change schedule, update in `values-sandbox.yaml`:

```yaml
cronjob:
  schedule: "0 2 * * *"  # 2 AM UTC
```

Then upgrade:

```bash
helm upgrade github-metrics k8s/github-metrics \
  -f k8s/github-metrics/values-sandbox.yaml \
  -n github-metrics-sandbox
```

## Resource Limits

Default limits should work for most cases:

- CPU: 500m request, 2000m limit
- Memory: 1Gi request, 4Gi limit

If you see OOM errors, increase memory in values file.

## Cleanup

To remove everything:

```bash
# Delete Helm release
helm uninstall github-metrics -n github-metrics-sandbox

# Delete namespace
kubectl delete namespace github-metrics-sandbox

# Delete AWS resources
aws secretsmanager delete-secret --secret-id a209530/github-metrics/sandbox --force-delete-without-recovery
aws iam detach-role-policy --role-name a209530-github-metrics-secrets --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/a209530-github-metrics-secrets-policy
aws iam delete-role --role-name a209530-github-metrics-secrets
aws iam delete-policy --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/a209530-github-metrics-secrets-policy
aws ecr delete-repository --repository-name github-metrics --force
```

## Time Estimate

- AWS Setup: 10 minutes
- Build and Push: 5 minutes
- Update Values: 2 minutes
- Deploy: 2 minutes
- Test: 3 minutes
- Verification: 2 minutes

**Total: ~25 minutes** for first environment

Additional environments: ~10 minutes each
