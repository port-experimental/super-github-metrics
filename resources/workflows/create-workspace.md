# Workflow: create-workspace

Purpose
- Creates a new Coder workspace for a selected template.

Capabilities
- Provisions a workspace with a name, template, and TTL.
- Uses Coder API for creation.

Command
- `bun run create-workspace --template <template_id> --name <workspace_name> --ttl <ttl_ms>`

Blueprints
- None (no Port entities are written).

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `PORT_BASE_URL`
- `CODER_SESSION_TOKEN`
- `CODER_API_BASE_URL`
- `CODER_ORGANIZATION_ID`
