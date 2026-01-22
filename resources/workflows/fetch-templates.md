# Workflow: fetch-templates

Purpose
- Fetches Coder templates and stores them in Port.

Capabilities
- Pulls template metadata from Coder.
- Upserts template entities into Port.

Command
- `bun run fetch-templates`

Blueprints
- [coder_template](../../blueprints/coder_template/README.md)

Required environment variables
- `PORT_CLIENT_ID`
- `PORT_CLIENT_SECRET`
- `CODER_SESSION_TOKEN`
- `CODER_API_BASE_URL`
- `CODER_ORGANIZATION_ID`
