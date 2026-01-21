# Workflow: list-user-additions

Purpose
- Lists GitHub organization user addition events and writes logs to artifacts.

Capabilities
- Queries audit logs for member add events.
- Emits logs for review and debugging.

Command
- `bun run src/github/main.ts list-user-additions`

Blueprints
- None (no Port entities are written).

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `X_GITHUB_ORGS`
- GitHub auth: set `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, `X_GITHUB_APP_INSTALLATION_ID` together or set `X_GITHUB_TOKEN`.

Optional environment variables
- `X_GITHUB_ENTERPRISE`
- `DEBUG` (set to `true` for debug output)
