# Workflow: onboarding-metrics

Purpose
- Calculates developer onboarding milestones and writes them to Port.

Capabilities
- Finds join dates from org audit logs (when available).
- Computes first/tenth commit and PR dates plus timing deltas.
- Stores onboarding metrics per GitHub user.

Command
- `bun run onboarding-metrics`

Blueprints
- [githubUser](../../blueprints/githubUser/README.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `X_GITHUB_ORGS`
- GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
- `X_GITHUB_ENTERPRISE`
- `FORCE_ONBOARDING_METRICS` (set to `true` to reprocess all users)
- (use for GitHub Enterprise so the correct base URL is used) `ONBOARDING_BATCH_SIZE` (defaults to `3`)
