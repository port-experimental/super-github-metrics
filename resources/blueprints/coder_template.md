# Blueprint: coder_template

Purpose
- Stores Coder template metadata for workspace provisioning insights.

Port blueprint identifier
- `coder_template`

Entity identifier example
- `<organization_id>-<template_id>-<active_version_id>` (example: `org-1234-5678-9012`).

Relations
- None defined on this blueprint.

Populated by
- `fetch-templates`

Blueprint definition
```json
{
  "identifier": "coder_template",
  "description": "A workspace template in the coder platform",
  "title": "Coder Template",
  "icon": "Template",
  "schema": {
    "properties": {
      "owner_name": {
        "type": "string",
        "title": "Owner Name"
      },
      "owner_id": {
        "type": "string",
        "title": "Owner ID"
      },
      "organization_id": {
        "type": "string",
        "title": "Organization ID"
      },
      "organization_name": {
        "type": "string",
        "title": "Organization Name"
      },
      "active_version_id": {
        "type": "string",
        "title": "Active Version Id"
      },
      "active_user_count": {
        "type": "string",
        "title": "Active User Count"
      },
      "created_at": {
        "type": "string",
        "title": "Created At",
        "format": "date-time"
      },
      "created_by_id": {
        "type": "string",
        "title": "Created By Id"
      },
      "created_by_name": {
        "type": "string",
        "title": "Created By Name"
      },
      "default_ttl_ms": {
        "type": "number",
        "title": "Default TTL",
        "description": "Default TTL in ms"
      },
      "deprecated": {
        "type": "boolean",
        "title": "Deprecated"
      },
      "deprecation_message": {
        "type": "string",
        "title": "Deprecation Message"
      },
      "description": {
        "type": "string",
        "title": "Description"
      }
    },
    "required": []
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "aggregationProperties": {},
  "relations": {}
}
```
