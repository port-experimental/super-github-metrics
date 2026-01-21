# Workflow: workflow-metrics

Purpose
- Tracks CI/CD workflow reliability and duration metrics.

Capabilities
- Computes success rate, average duration, total runs, and last run status/date.
- Stores metrics per repository workflow.

Command
- `bun run workflow-metrics`

Blueprints
- [githubWorkflow](../../blueprints/githubWorkflow/README.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `X_GITHUB_ORGS`
- GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
- (use for GitHub Enterprise so the correct base URL is used) `X_GITHUB_ENTERPRISE`
