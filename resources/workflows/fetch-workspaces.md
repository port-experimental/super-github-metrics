# Workflow: fetch-workspaces

Purpose
- Fetches Coder workspaces and stores them in Port.

Capabilities
- Pulls workspace metadata, health, and cost signals.
- Upserts workspace entities into Port.

Command
- `bun run fetch-workspaces`

Blueprints
- [coder_workspace](../blueprints/coder_workspace.md)
- [coder_template](../blueprints/coder_template.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `PORT_BASE_URL`
- `CODER_SESSION_TOKEN`
- `CODER_API_BASE_URL`
- `CODER_ORGANIZATION_ID`
