# Workflow: timeseries-service-metrics

Purpose
-  Produces time-series service metrics for dashboards and trend analysis.

Capabilities
-  Emits daily/weekly/monthly rollups for service PR health.
-  Stores historical datapoints for charting.

Command
-  `bun run timeseries-service-metrics`

Blueprints
-  [serviceMetrics](../../blueprints/serviceMetrics/README.md)
-  [service](../../blueprints/service/README.md)

Required environment variables
-  `PORT_CLIENT_ID`
-  `PORT_CLIENT_SECRET`
-  `X_GITHUB_ORGS`
-  GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
-  (use for GitHub Enterprise so the correct base URL is used) `X_GITHUB_ENTERPRISE`
