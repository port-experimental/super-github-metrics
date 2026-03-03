# Deployment Status - February 4, 2026

## ✅ Completed

### 1. AWS Infrastructure (Deployed via CLI)

All AWS resources successfully created in tr-idp-preprod account (992398098861):

**ECR Repository**
- Repository: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
- ARN: `arn:aws:ecr:us-east-1:992398098861:repository/github-metrics`
- Scan on push: Enabled
- Lifecycle: Keep last 30 images

**Secrets Manager**
- Sandbox: `a209530/github-metrics/sandbox` - **POPULATED and validated**
- Dev: `a209530/github-metrics/dev` - Empty (populate when ready)
- Staging: `a209530/github-metrics/staging` - Empty (populate when ready)

**IAM Roles with IRSA**
- Sandbox: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-sandbox`
- Dev: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-dev`
- Staging: `arn:aws:iam::992398098861:role/a209530-github-metrics-secrets-staging`

Each role configured with:
- OIDC trust policy for service account in correct namespace
- Permissions to read corresponding secret
- Required TR tags and permissions boundary

**CodeBuild Project**
- Project: `codebuild-a209530-IDP-github-metrics`
- ARN: `arn:aws:codebuild:us-east-1:118358297744:project/codebuild-a209530-IDP-github-metrics`
- Account: TR CICD (118358297744) / profile: `tr-cicd-prod`
- Service Role: `arn:aws:iam::118358297744:role/service-role/a209530-CICD-Deployment`
- Environment: Linux, x86_64, Medium compute, Privileged mode
- VPC: `vpc-0743cad3a35c12722` with 3 subnets
- Purpose: Self-hosted GitHub Actions runner for builds and deployments

### 2. Infrastructure as Code

**CloudFormation Templates**
- `cloudformation/ecr.yaml` - ECR repository
- `cloudformation/secrets-manager.yaml` - Secrets for all environments
- `cloudformation/iam-irsa.yaml` - IAM roles with IRSA
- `cloudformation/parameters/preprod.json` - Account-specific parameters
- `cloudformation/scripts/` - Validation and deployment scripts

**GitHub Actions Workflow**
- `.github/workflows/release.yml` - Complete CI/CD pipeline using CodeBuild runners
  - Extracts version from package.json
  - Creates GitHub releases
  - Builds using reusable workflow from `tr/aiid209530-port-catalog`
  - Deploys directly with Helm (no ArgoCD dependency)
  - Automatic promotion: sandbox → dev → staging

**Deployment Pattern**:
- **Build**: Uses reusable workflow for CodeBuild-based container builds
- **Deploy**: Direct Helm deployment on CodeBuild runners
  - Assumes PowerUser2 role for kubectl/helm access
  - Runs `helm upgrade --install` directly
  - Verifies CronJob and Secret creation

### 3. Kubernetes Configuration

**Helm Charts Updated**
- `k8s/github-metrics/values-sandbox.yaml` - Namespace: 209530-idp-sandbox
- `k8s/github-metrics/values-dev.yaml` - Namespace: 209530-idp-dev
- `k8s/github-metrics/values-staging.yaml` - Namespace: 209530-idp-staging

All updated with:
- Correct IAM role ARNs for IRSA
- ARM64 node selector for us-east-1c
- Correct secret paths
- imagePullSecrets for ECR

### 4. Container Images

**Dockerfiles**
- `Dockerfile` - Chainguard-based multi-stage build
- `Dockerfile.simple` - Alpine-based alternative (for local testing)
- `scripts/run-metrics.sh` - Entrypoint script

### 5. Documentation

All documentation organized in `docs/` directory:
- `DEPLOYMENT.md` - Complete end-to-end deployment guide
- `DEPLOYMENT_STATUS_2026-02-04.md` - This file
- `IMPLEMENTATION_COMPLETE.md` - Summary of all work
- `BUILD_STATUS.md` - Local build issues and resolution
- `KUBERNETES_DEPLOYMENT.md` - K8s deployment details
- CloudFormation README and guides

### 6. Code Status

**Changes Made**:
- Removed old GitHub Actions workflows (build-and-push.yml, deploy-*.yml)
- Removed CloudFormation GitHub Actions IAM templates (not needed with CodeBuild)
- Created new release.yml with CodeBuild builds + direct Helm deployment
- No ArgoCD dependency - direct Helm deployment
- Ready to commit and push

---

## ⏳ Pending

### 1. Version Bump in package.json

Current version in package.json determines the release tag. Bump before merging:

```json
{
  "version": "1.0.0"
}
```

This will create release `v1.0.0` and build images:
- `sandbox-1.0.0`
- `dev-1.0.0`
- `staging-1.0.0`

### 2. Merge to Main Branch

Current state: Code on feature branch `feature/graphql-pr-reviews`

Options:
1. **Create Pull Request** - Review before merging to main
2. **Direct merge** - If review already done

After merge to main:
- `release.yml` triggers automatically
- Checks if release already exists
- If new version, creates GitHub release
- Builds via CodeBuild in CICD account
- Assumes PowerUser2 role for ECR push
- Pushes environment-specific tags to ECR
- Deploys directly with Helm to each namespace

### 3. Environment Secrets Population

When ready to deploy to dev/staging:

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

---

## 🎯 Next Steps (Recommended Order)

### Step 1: Commit and Push Changes

```bash
git add .
git commit -m "feat: add CodeBuild-based CI/CD with direct Helm deployment

- Use CodeBuild runners for builds (via reusable workflow)
- Direct Helm deployment (no ArgoCD dependency)
- Automatic promotion: sandbox → dev → staging
- Remove old GitHub Actions workflows"

git push origin feature/graphql-pr-reviews
```

### Step 2: Create Pull Request

```bash
gh pr create \
  --title "feat: add Kubernetes deployment infrastructure with CodeBuild" \
  --body "Complete K8s deployment using CodeBuild runners and direct Helm deployment"
```

### Step 3: Bump Version and Merge

```bash
# Update package.json version to 1.0.0
# Merge PR to main

# GitHub Actions will:
# 1. Create release v1.0.0
# 2. Build image via CodeBuild
# 3. Push to ECR with tags: sandbox-1.0.0, dev-1.0.0, staging-1.0.0
# 4. Deploy to sandbox with Helm
# 5. Deploy to dev with Helm
# 6. Deploy to staging with Helm
```

### Step 4: Verify Sandbox Deployment

```bash
# Check CronJob in namespace
kubectl get cronjob -n 209530-idp-sandbox

# Check secrets synced
kubectl get secret github-metrics-secrets -n 209530-idp-sandbox -o jsonpath='{.data}' | jq 'keys'

# Trigger manual job
kubectl create job --from=cronjob/github-metrics github-metrics-test -n 209530-idp-sandbox

# Check logs
kubectl logs job/github-metrics-test -n 209530-idp-sandbox -f
```

### Step 5: Verify Metrics in Port

Check Port UI for updated metrics in:
- `serviceMetrics` blueprint
- `serviceTimeSeriesMetrics` blueprint
- PR entities with metrics
- Workflow entities with metrics

### Step 6: Promote to Dev (when ready)

**Option 1: Automatic** (after sandbox succeeds)
- GitHub Actions automatically builds and deploys to dev
- Requires dev secret to be populated

**Option 2: Manual**
```bash
gh workflow run release.yml \
  -f release-version=1.0.0 \
  -f environment=dev
```

### Step 7: Promote to Staging (when ready)

**Option 1: Automatic** (after dev succeeds)
- GitHub Actions automatically builds and deploys to staging
- Requires staging secret to be populated

**Option 2: Manual**
```bash
gh workflow run release.yml \
  -f release-version=1.0.0 \
  -f environment=staging
```

---

## 📋 Verification Checklist

### Infrastructure
- [x] ECR repository exists
- [x] Sandbox secret populated and validated
- [ ] Dev secret populated (when ready)
- [ ] Staging secret populated (when ready)
- [x] IAM roles with IRSA created
- [x] **CodeBuild project created** - `codebuild-a209530-IDP-github-metrics`

### Code
- [x] CloudFormation templates created
- [x] GitHub Actions workflow created (release.yml)
- [x] Helm charts updated
- [x] Documentation complete
- [ ] Changes committed
- [ ] Changes pushed to remote

### Deployment
- [x] CodeBuild project exists
- [ ] Pull request created
- [ ] Code merged to main
- [ ] GitHub release created
- [ ] Container built and pushed to ECR
- [ ] Helm deployed to sandbox
- [ ] CronJob running in sandbox
- [ ] Metrics appearing in Port

### Environments
- [ ] Sandbox deployed and verified
- [ ] Dev secret populated
- [ ] Dev deployed and verified
- [ ] Staging secret populated
- [ ] Staging deployed and verified

---

## 🔧 Architecture Summary

### CI/CD Flow

```
Developer Push to main
  ↓
GitHub Actions (release.yml)
  ↓
CodeBuild Runner (CICD account 460300312212)
  ↓
Assume PowerUser2 Role (target account 992398098861)
  ↓
Build Multi-Arch Image
  ↓
Push to ECR (sandbox-1.0.0, dev-1.0.0, staging-1.0.0)
  ↓
Deploy Sandbox (CodeBuild Runner)
  ├─ Assume PowerUser2 Role
  ├─ Update kubeconfig for EKS
  ├─ helm upgrade --install
  └─ Verify CronJob and Secret
  ↓ (on success)
Deploy Dev (same pattern)
  ↓ (on success)
Deploy Staging (same pattern)
```

### Deployment Pattern

**Build** (via reusable workflow):
- CodeBuild in CICD account
- Assumes PowerUser2 role
- Builds and pushes to ECR
- Tags: `{environment}-{version}`

**Deploy** (direct Helm):
- CodeBuild runner
- Assumes PowerUser2 role
- Updates kubeconfig for EKS
- Runs `helm upgrade --install`
- Verifies deployment

**Benefits**:
- No ArgoCD dependency
- Consistent with TR patterns
- Access to TR Chainguard registry
- Platform team manages CodeBuild
- Direct deployment feedback
- Environment promotion built-in

---

## 🚨 Known Issues

1. **Local Docker Build**: TLS certificate validation errors when pulling base images
   - Resolution: Use GitHub Actions with CodeBuild (recommended)
   - Alternative: Investigate certificate issues in local environment

---

## 📞 Support

For issues with:
- **CodeBuild Project**: Contact platform team
- **AWS Infrastructure**: Check CloudFormation templates and parameter files
- **GitHub Actions**: Check workflow file `.github/workflows/release.yml`
- **Kubernetes**: Check Helm values files in `k8s/github-metrics/`

All infrastructure follows established patterns from other services in the tr-idp-preprod cluster.
