# AWS Setup Guide

This guide covers the AWS infrastructure setup required for deploying the GitHub metrics collection CronJob.

## Prerequisites

- AWS CLI configured with appropriate credentials
- `jq` for JSON processing
- Access to create IAM roles, ECR repositories, and Secrets Manager secrets

## 1. Create ECR Repositories

Create an ECR repository in each AWS account where you'll deploy the application.

### Sandbox Account (992398098861)

```bash
aws ecr create-repository \
  --repository-name github-metrics \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile sandbox
```

### Dev Account

```bash
aws ecr create-repository \
  --repository-name github-metrics \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile dev
```

### Staging Account

```bash
aws ecr create-repository \
  --repository-name github-metrics \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile staging
```

## 2. Create AWS Secrets Manager Secrets

Store sensitive configuration in AWS Secrets Manager for each environment.

### Secret Content

Create a JSON file for each environment (e.g., `sandbox-secret.json`):

```json
{
  "PORT_CLIENT_ID": "your_port_client_id_here",
  "PORT_CLIENT_SECRET": "your_port_client_secret_here",
  "X_GITHUB_APP_ID": "123456",
  "X_GITHUB_APP_INSTALLATION_ID": "98765432",
  "X_GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
}
```

### Create Secrets

#### Sandbox

```bash
aws secretsmanager create-secret \
  --name a209530/github-metrics/sandbox \
  --description "GitHub metrics secrets for sandbox environment" \
  --secret-string file://sandbox-secret.json \
  --region us-east-1 \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile sandbox
```

#### Dev

```bash
aws secretsmanager create-secret \
  --name a209530/github-metrics/dev \
  --description "GitHub metrics secrets for dev environment" \
  --secret-string file://dev-secret.json \
  --region us-east-1 \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile dev
```

#### Staging

```bash
aws secretsmanager create-secret \
  --name a209530/github-metrics/staging \
  --description "GitHub metrics secrets for staging environment" \
  --secret-string file://staging-secret.json \
  --region us-east-1 \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile staging
```

### Update Secrets (if needed)

```bash
aws secretsmanager update-secret \
  --secret-id a209530/github-metrics/sandbox \
  --secret-string file://sandbox-secret.json \
  --region us-east-1 \
  --profile sandbox
```

## 3. Create IAM Roles for IRSA

Create IAM roles that allow the Kubernetes ServiceAccount to access Secrets Manager.

### IAM Policy Document

Create `secrets-policy.json`:

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
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:a209530/github-metrics/ENVIRONMENT-*"
    }
  ]
}
```

### IAM Trust Policy

Create `trust-policy.json` (replace `ACCOUNT_ID`, `OIDC_PROVIDER`, and `NAMESPACE`):

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
          "OIDC_PROVIDER:sub": "system:serviceaccount:NAMESPACE:github-metrics",
          "OIDC_PROVIDER:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

### Create IAM Role

#### Sandbox

```bash
# Get OIDC provider for your EKS cluster
OIDC_PROVIDER=$(aws eks describe-cluster \
  --name your-cluster-name \
  --query "cluster.identity.oidc.issuer" \
  --output text | sed 's/https:\/\///' \
  --profile sandbox)

# Update trust policy with actual values
cat > sandbox-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::992398098861:oidc-provider/${OIDC_PROVIDER}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_PROVIDER}:sub": "system:serviceaccount:github-metrics-sandbox:github-metrics",
          "${OIDC_PROVIDER}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF

# Create policy
aws iam create-policy \
  --policy-name a209530-github-metrics-secrets-policy \
  --policy-document file://secrets-policy.json \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile sandbox

# Create role
aws iam create-role \
  --role-name a209530-github-metrics-secrets \
  --assume-role-policy-document file://sandbox-trust-policy.json \
  --permissions-boundary arn:aws:iam::992398098861:policy/tr-permission-boundary \
  --tags \
    Key=tr:application-asset-insight-id,Value=209530 \
    Key=tr:resource-owner,Value=eamon.mason@thomsonreuters.com \
  --profile sandbox

# Attach policy to role
aws iam attach-role-policy \
  --role-name a209530-github-metrics-secrets \
  --policy-arn arn:aws:iam::992398098861:policy/a209530-github-metrics-secrets-policy \
  --profile sandbox
```

Repeat similar steps for dev and staging environments with appropriate account IDs and namespaces.

## 4. Verify Setup

### Verify ECR Repository

```bash
aws ecr describe-repositories \
  --repository-names github-metrics \
  --region us-east-1 \
  --profile sandbox
```

### Verify Secret

```bash
aws secretsmanager get-secret-value \
  --secret-id a209530/github-metrics/sandbox \
  --region us-east-1 \
  --profile sandbox \
  --query SecretString \
  --output text | jq .
```

### Verify IAM Role

```bash
aws iam get-role \
  --role-name a209530-github-metrics-secrets \
  --profile sandbox

aws iam list-attached-role-policies \
  --role-name a209530-github-metrics-secrets \
  --profile sandbox
```

## 5. Update Helm Values

After creating the IAM roles, update the environment-specific values files with the correct role ARNs:

### values-sandbox.yaml

```yaml
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::992398098861:role/a209530-github-metrics-secrets
```

### values-dev.yaml

```yaml
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::DEV_ACCOUNT_ID:role/a209530-github-metrics-secrets
```

### values-staging.yaml

```yaml
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::STAGING_ACCOUNT_ID:role/a209530-github-metrics-secrets
```

## 6. Test Secret Access

After deploying to Kubernetes, test that the secrets are accessible:

```bash
# Check SecretProviderClass
kubectl describe secretproviderclass github-metrics-spc -n github-metrics-sandbox

# Check that Kubernetes secret was created
kubectl get secret github-metrics-secrets -n github-metrics-sandbox

# Verify secret keys (don't show values)
kubectl get secret github-metrics-secrets -n github-metrics-sandbox -o jsonpath='{.data}' | jq 'keys'
```

## Cleanup

If you need to remove resources:

```bash
# Delete secret
aws secretsmanager delete-secret \
  --secret-id a209530/github-metrics/sandbox \
  --force-delete-without-recovery \
  --region us-east-1 \
  --profile sandbox

# Detach policy from role
aws iam detach-role-policy \
  --role-name a209530-github-metrics-secrets \
  --policy-arn arn:aws:iam::992398098861:policy/a209530-github-metrics-secrets-policy \
  --profile sandbox

# Delete role
aws iam delete-role \
  --role-name a209530-github-metrics-secrets \
  --profile sandbox

# Delete policy
aws iam delete-policy \
  --policy-arn arn:aws:iam::992398098861:policy/a209530-github-metrics-secrets-policy \
  --profile sandbox

# Delete ECR repository
aws ecr delete-repository \
  --repository-name github-metrics \
  --force \
  --region us-east-1 \
  --profile sandbox
```

## Security Notes

- IAM roles follow TR naming convention (prefix: `a209530-`)
- All resources are tagged with required TR tags
- Permissions boundary is applied to all IAM roles
- Secrets are encrypted at rest in Secrets Manager
- IRSA ensures no long-lived credentials in pods
- Least privilege: only GetSecretValue permission granted
