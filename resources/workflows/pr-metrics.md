# Workflow: pr-metrics

Purpose
-  Calculates PR performance metrics and writes them to Port.

Capabilities
-  Computes PR size, lifetime, pickup/approve/merge times, maturity, and review participation.
-  Aggregates per time period for repository PR health signals.

Command
-  `bun run pr-metrics`

Blueprints
-  [githubPullRequest](../../blueprints/githubPullRequest/README.md)
-  [service](../../blueprints/service/README.md)

Required environment variables
-  `PORT_CLIENT_ID`
-  `PORT_CLIENT_SECRET`
-  `X_GITHUB_ORGS`
-  GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
-  (use for GitHub Enterprise so the correct base URL is used) `X_GITHUB_ENTERPRISE`
