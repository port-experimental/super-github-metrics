# Blueprint: serviceMetrics

Purpose
- Stores time-series service metrics used for dashboards (daily/weekly/monthly rollups).

Port blueprint identifier
- `serviceMetrics`

Entity identifier example
- `{serviceName}{periodType}{period}` where periodType is `d`, `w`, or `m` and period is `YYYYMMDD` (service name is truncated to fit 30 chars).
- Example: `payments-service-d20240115`.

Relations
- `service` -> `service` (uses repository name as the service identifier).

Populated by
- `timeseries-service-metrics`

Blueprint definition
```json
{
  "identifier": "serviceMetrics",
  "description": "Time-series metrics for services to enable dashboard visualizations",
  "title": "Service Metrics",
  "icon": "Chart",
  "schema": {
    "properties": {
      "period": {
        "type": "string",
        "title": "Time Period",
        "description": "The time period this metric represents (ISO8601 datetime format: YYYY-MM-DDT00:00:00.000Z for daily, weekly start, and monthly start)",
        "format": "date-time"
      },
      "period_type": {
        "type": "string",
        "title": "Period Type",
        "description": "The type of time period (daily, weekly, monthly)",
        "enum": ["daily", "weekly", "monthly"],
        "enumColors": {
          "daily": "blue",
          "weekly": "yellow",
          "monthly": "green"
        }
      },
      "total_prs": {
        "type": "number",
        "title": "Total Pull Requests",
        "description": "Total number of pull requests in this period"
      },
      "total_merged_prs": {
        "type": "number",
        "title": "Total Merged PRs",
        "description": "Total number of merged pull requests in this period"
      },
      "number_of_prs_reviewed": {
        "type": "number",
        "title": "PRs Reviewed",
        "description": "Number of pull requests that received at least one review"
      },
      "number_of_prs_merged_without_review": {
        "type": "number",
        "title": "PRs Merged Without Review",
        "description": "Number of pull requests merged without any reviews"
      },
      "percentage_of_prs_reviewed": {
        "type": "number",
        "title": "PR Review Percentage",
        "description": "Percentage of pull requests that received at least one review"
      },
      "percentage_of_prs_merged_without_review": {
        "type": "number",
        "title": "PR Merged Without Review Percentage",
        "description": "Percentage of pull requests merged without any reviews"
      },
      "average_time_to_first_review": {
        "type": "number",
        "title": "Average Time to First Review (Days)",
        "description": "Average time in days from PR creation to first review"
      },
      "pr_success_rate": {
        "type": "number",
        "title": "PR Success Rate (%)",
        "description": "Percentage of pull requests that were successfully merged"
      },
      "contribution_standard_deviation": {
        "type": "number",
        "title": "Contribution Standard Deviation",
        "description": "Standard deviation of contribution counts across contributors"
      },
      "calculated_at": {
        "type": "string",
        "title": "Calculated At",
        "description": "Timestamp when these metrics were calculated",
        "format": "date-time"
      },
      "data_source": {
        "type": "string",
        "title": "Data Source",
        "description": "Source of the metrics data",
        "default": "github"
      }
    },
    "required": ["period", "period_type", "total_prs", "total_merged_prs"]
  },
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
