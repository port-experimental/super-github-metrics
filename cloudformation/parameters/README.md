# CloudFormation Parameters

This directory contains parameter files for CloudFormation deployments.

## preprod.json

Parameters for deploying to the `tr-idp-preprod` AWS account (992398098861).

### Parameters

| Parameter | Description | Value |
|-----------|-------------|-------|
| OIDCProviderArn | EKS OIDC Provider ARN | arn:aws:iam::992398098861:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3 |
| OIDCProvider | OIDC Provider URL (without https://) | oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3 |
| PermissionsBoundaryArn | TR Permissions Boundary Policy | arn:aws:iam::992398098861:policy/tr-permission-boundary |
| ApplicationId | TR Application Asset Insight ID | 209530 |
| ResourceOwner | TR Resource Owner | eamon.mason@thomsonreuters.com |

### How to Get These Values

**OIDC Provider ARN and URL:**

```bash
# Get OIDC provider for EKS cluster
aws eks describe-cluster \
  --profile tr-idp-preprod \
  --region us-east-1 \
  --name a209567-preprod-idp-useast1-plexus-cluster \
  --query 'cluster.identity.oidc.issuer' \
  --output text

# Example output: https://oidc.eks.us-east-1.amazonaws.com/id/4239CFFD07D919F3031538ECD4E5D2D3

# OIDCProviderArn format:
# arn:aws:iam::ACCOUNT_ID:oidc-provider/oidc.eks.REGION.amazonaws.com/id/OIDC_ID

# OIDCProvider format (remove https://):
# oidc.eks.REGION.amazonaws.com/id/OIDC_ID
```

**Permissions Boundary:**

```bash
# List policies to find permissions boundary
aws iam list-policies \
  --profile tr-idp-preprod \
  --scope Local \
  --query 'Policies[?contains(PolicyName, `permission`) || contains(PolicyName, `boundary`)].{Name:PolicyName, Arn:Arn}'
```

## Adding New Environments

To deploy to a different environment, create a new parameters file:

```bash
cp cloudformation/parameters/preprod.json cloudformation/parameters/prod.json
# Edit prod.json with production account values
```

Then deploy using:

```bash
export PARAM_FILE=cloudformation/parameters/prod.json
./cloudformation/scripts/deploy.sh
```
