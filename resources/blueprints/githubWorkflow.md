# Blueprint: githubWorkflow

Purpose
- Stores workflow performance and reliability metrics per repository workflow.

Port blueprint identifier
- `githubWorkflow`

Entity identifier example
- Repository name + workflow ID (example: `payments-api-123456`).

Relations
- `service` -> `service` (uses repository name as the service identifier).

Populated by
- `workflow-metrics`

Blueprint definition
```json
{
  "identifier": "githubWorkflow",
  "title": "GitHub Workflow",
  "icon": "Github",
  "schema": {
    "properties": {
      "workflowName": {
        "type": "string",
        "title": "Workflow Name",
        "description": "Name of the GitHub workflow"
      },
      "successRate": {
        "type": "number",
        "title": "Success Rate (30 days)",
        "description": "Percentage of successful workflow runs in the last 30 days"
      },
      "averageDuration": {
        "type": "number",
        "title": "Average Duration (minutes)",
        "description": "Average execution time of the workflow in minutes"
      },
      "totalRuns": {
        "type": "number",
        "title": "Total Runs (30 days)",
        "description": "Total number of workflow runs in the last 30 days"
      },
      "lastRunStatus": {
        "type": "string",
        "title": "Last Run Status",
        "description": "Status of the most recent workflow run",
        "enum": ["success", "failure", "cancelled", "skipped", "in_progress"]
      },
      "lastRunDate": {
        "type": "string",
        "format": "date-time",
        "title": "Last Run Date",
        "description": "Date and time of the most recent workflow run"
      }
    },
    "required": ["workflowName"]
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "relations": {
    "service": {
      "title": "Service",
      "target": "service",
      "required": true,
      "many": false
    }
  }
}
```
