# Workflow: service-metrics

Purpose
- Calculates repository-level service metrics and writes them to Port.

Capabilities
- Tracks review coverage, review response time, PR success rate, and contribution distribution.
- Produces rolling metrics across multiple time windows.

Command
- `bun run service-metrics`

Blueprints
- [service](../blueprints/service.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `PORT_BASE_URL`
- `X_GITHUB_ORGS`
- GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
- `X_GITHUB_ENTERPRISE` - use for GitHub Enterprise so the correct base URL is used
