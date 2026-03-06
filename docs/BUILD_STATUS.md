# Container Build Status

## Current Status: ⚠️ BLOCKED - Certificate Issues

### Completed Steps ✅

1. **ECR Authentication** ✅
   - Logged into target ECR: `992398098861.dkr.ecr.us-east-1.amazonaws.com`
   - Logged into TR Chainguard ECR: `460300312212.dkr.ecr.us-east-1.amazonaws.com`

2. **Build Preparation** ✅
   - Dockerfile reviewed and analyzed
   - Alternative Dockerfile created (Dockerfile.simple)
   - Git SHA identified: `97d6618`

### Current Blocker ⚠️

**TLS Certificate Validation Error**:
```
tls: failed to verify certificate: x509: certificate signed by unknown authority
```

This occurs when trying to pull base images from:
- TR Chainguard ECR (original Dockerfile)
- Docker Hub (alternative Dockerfile)

### Build Attempts

#### Attempt 1: Original Dockerfile (Chainguard Base)
**Issue**: Chainguard images are minimal and missing required tools:
- `curl` not available (needed to install Bun)
- User `nonroot` configuration issues

#### Attempt 2: Alpine Node Base (Dockerfile.simple)
**Issue**: TLS certificate validation failure when pulling from Docker Hub

## Recommended Solutions

### Option 1: Use GitHub Actions (Recommended) 🎯

The GitHub Actions workflow is already configured and will handle multi-arch builds automatically:

```bash
# Push to main branch to trigger build
git add .
git commit -m "Ready for container build"
git push origin main

# Monitor: GitHub → Actions → "Build and Push Container Image"
```

**Advantages**:
- Runs in GitHub's infrastructure (no local certificate issues)
- Multi-arch build (amd64 + arm64) via buildx
- Security scanning with Trivy
- Automatic push to ECR
- Automatic sandbox deployment

**Prerequisites**:
- GitHub Actions IAM role for ECR push (needs to be created)

### Option 2: Build on Different Machine

Build on a machine with:
- Proper Docker/containerd setup
- Valid certificate trust store
- Network access to Docker Hub and TR ECR

### Option 3: Fix Local Certificate Issues

1. **Identify the issue**:
   ```bash
   # Check certificate store
   docker system info | grep -A 10 "Registry"

   # Test docker hub connectivity
   curl -v https://registry-1.docker.io/v2/
   ```

2. **Possible fixes**:
   - Update certificate trust store
   - Configure insecure registries (not recommended for production)
   - Set up Docker daemon with proper certificates

### Option 4: Manual Build Without Docker

Since this is a Bun/TypeScript project, you could:

1. Compile the TypeScript code
2. Package node_modules
3. Create tarball
4. Deploy directly to Kubernetes (not containerized)

**Not recommended** - containers provide isolation and consistency.

## Dockerfile Issues Identified

### Original Dockerfile Problems

1. **Missing curl in Chainguard image**
   ```dockerfile
   RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.42"
   # ERROR: curl: not found
   ```

2. **User setup issues**
   ```dockerfile
   COPY --chown=nonroot:nonroot package.json bun.lockb* ./
   # ERROR: unable to find user nonroot
   ```

### Recommended Dockerfile Fixes (For Future)

Use Chainguard images correctly:

```dockerfile
# Use builder image with tools
FROM 460300312212.dkr.ecr.us-east-1.amazonaws.com/tr-chainguard/node:latest-dev AS builder

WORKDIR /app

# Chainguard images use UID 65532 for nonroot
USER root

# Install Bun (need to use different method without curl)
# OR: Use npm/yarn instead since Node is already available

# Copy files
COPY package.json ./
RUN npm install --production

COPY src/ ./src/
COPY scripts/ ./scripts/

# Final stage - minimal runtime
FROM 460300312212.dkr.ecr.us-east-1.amazonaws.com/tr-chainguard/node:latest

WORKDIR /app

# Copy from builder
COPY --from=builder /app /app

# Chainguard nonroot user is already configured (UID 65532)
USER 65532

ENTRYPOINT ["/app/scripts/run-metrics.sh"]
```

## Next Steps

### Immediate: Use GitHub Actions

1. **Create GitHub Actions IAM role** for ECR push:
   ```bash
   # This needs to be done by someone with CloudFormation/IAM permissions
   # Role name: github-actions-ecr-push
   # Trust policy: GitHub OIDC provider
   # Permissions: ECR push to 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics
   ```

2. **Push to trigger build**:
   ```bash
   git add -A
   git commit -m "Infrastructure ready, trigger CI/CD build"
   git push origin main
   ```

3. **Monitor build**:
   - GitHub → Actions tab
   - Watch "Build and Push Container Image" workflow
   - Verify sandbox deployment

### Alternative: Manual Build on Working Machine

If you have access to a machine with working Docker:

```bash
# On the working machine:
git pull origin main

# Login to ECR
aws ecr get-login-password --profile tr-idp-preprod --region us-east-1 | \
  docker login --username AWS --password-stdin 992398098861.dkr.ecr.us-east-1.amazonaws.com

aws ecr get-login-password --profile tr-idp-preprod --region us-east-1 | \
  docker login --username AWS --password-stdin 460300312212.dkr.ecr.us-east-1.amazonaws.com

# Build multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:$(git rev-parse --short HEAD) \
  -t 992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics:latest \
  --push .
```

## Current Git State

```
Git SHA: 97d6618
Branch: feature/graphql-pr-reviews
Uncommitted changes: Yes (new CloudFormation files, Dockerfile.simple, docs)
```

## Resources Created So Far

✅ ECR Repository: `992398098861.dkr.ecr.us-east-1.amazonaws.com/github-metrics`
✅ Secrets Manager: 3 secrets (sandbox populated)
✅ IAM Roles: 3 roles with IRSA
✅ Sandbox secret: Populated and validated
⚠️ Container image: Not built yet (blocked)

## Summary

**AWS infrastructure is ready** for deployment. The blocker is building the container image due to local certificate/network issues.

**Recommended path forward**: Use GitHub Actions to build the image, which will work around local certificate issues and provide a proper CI/CD pipeline.
