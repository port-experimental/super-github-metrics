# Coder Integration

## Overview

Want to see a catalog of all of your Coder.com development workspaces and available templates in Port?  Better yet, do you want your developers to provision them with self-service?

## Setup

1. Clone repo
1. Setup the code and workflow configuration in a central repository. I'd recommend creating one `.port` repository for all of your GitHub actions for custom integrations and self-service actions
1. For your repository that will run the github actions, configure repository secrets for the following environmental variables:

        - PORT_CLIENT_ID
        - PORT_CLIENT_SECRET
        - CODER_SESSION_TOKEN
        - CODER_API_BASE_URL
        - CODER_ORGANIZATION_ID
1. Create blueprints in port for the two blueprints below `coder_template` and `coder_workspace`
1. Have fun!


## Sample blueprints


#### Coder Template
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

#### Coder Workspace

```json
{
  "identifier": "coder_workspace",
  "description": "A workspace in the coder platform",
  "title": "Coder Workspace",
  "icon": "Box",
  "schema": {
    "properties": {
      "owner_name": {
        "type": "string",
        "title": "Owner Name"
      },
      "ttl_ms": {
        "type": "number",
        "title": "TTL",
        "description": "The time to live in milliseconds"
      },
      "daily_cost": {
        "type": "number",
        "title": "Daily Cost",
        "description": "The daily cost for the workspace's latest build"
      },
      "owner_id": {
        "type": "string",
        "title": "Owner ID"
      },
      "automatic_updates": {
        "type": "string",
        "title": "Automatic Updates"
      },
      "autostart_schedule": {
        "type": "string",
        "title": "Autostart Schedule"
      },
      "created_at": {
        "type": "string",
        "title": "Created At",
        "format": "date-time"
      },
      "deleting_at": {
        "type": "string",
        "title": "Deleting At",
        "format": "date-time"
      },
      "dormant_at": {
        "type": "string",
        "title": "Dormant At",
        "format": "date-time"
      },
      "updated_at": {
        "type": "string",
        "title": "Updated At",
        "format": "date-time"
      },
      "last_used_at": {
        "type": "string",
        "title": "Last Used At",
        "format": "date-time"
      },
      "next_start_at": {
        "type": "string",
        "title": "Next Start At",
        "format": "date-time"
      },
      "organization_id": {
        "type": "string",
        "title": "Organization ID"
      },
      "organization_name": {
        "type": "string",
        "title": "Organization Name"
      },
      "latest_build_number": {
        "type": "number",
        "title": "Latest Build Number"
      },
      "healthy": {
        "type": "boolean",
        "title": "Healthy"
      }
    },
    "required": []
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "aggregationProperties": {},
  "relations": {
    "template_id": {
      "title": "Template",
      "description": "The template for the workspace",
      "target": "coder_template",
      "required": false,
      "many": false
    }
  }
}
```

