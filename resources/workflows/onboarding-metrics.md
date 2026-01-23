# Workflow: onboarding-metrics

Purpose
- Calculates developer onboarding milestones and writes them to Port.

Capabilities
- Finds join dates from enterprise audit logs.
- Computes first/tenth commit and PR dates plus timing deltas.
- Stores onboarding metrics per GitHub user.

Command
- `bun run onboarding-metrics`

Blueprints
- [githubUser](../blueprints/githubUser.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `PORT_BASE_URL`
- `X_GITHUB_ORGS`
- `X_GITHUB_ENTERPRISE` - required for audit log access (enterprise feature)
- GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
- `FORCE_ONBOARDING_METRICS` - set to `true` to force reprocessing of all users' onboarding metrics, even those already processed. Useful when recalculating metrics after fixing bugs or changing calculation logic.
- `ONBOARDING_BATCH_SIZE` - batch size for processing (defaults to `3`)
