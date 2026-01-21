# Blueprint: service

Purpose
- Represents a repository-level service and stores rolling service metrics (reviews, success rate, contribution stats).

Port blueprint identifier
- `service`

Entity identifier example
- Repository name (example: `payments-api`).

Relations
- None defined on this blueprint; other blueprints relate to it.

Populated by
- `service-metrics`

Blueprint definition
```json
{
  "identifier": "service",
  "title": "GitHub Repository",
  "icon": "GitRepository",
  "schema": {
    "properties": {
      "organization": {
        "type": "string",
        "title": "Repository Organization",
        "description": "The GitHub organization that owns the repository"
      },
      "number_of_prs_reviewed_1d": {
        "type": "number",
        "title": "Number of PRs Reviewed (1 day)",
        "description": "Count of PRs that received at least one review in the last 24 hours"
      },
      "number_of_prs_merged_without_review_1d": {
        "type": "number",
        "title": "Number of PRs Merged Without Review (1 day)",
        "description": "Count of PRs merged without any reviews in the last 24 hours"
      },
      "percentage_of_prs_reviewed_1d": {
        "type": "number",
        "title": "Percentage of PRs Reviewed (1 day)",
        "description": "Percentage of PRs that received reviews in the last 24 hours"
      },
      "percentage_of_prs_merged_without_review_1d": {
        "type": "number",
        "title": "Percentage of PRs Merged Without Review (1 day)",
        "description": "Percentage of merged PRs that had no reviews in the last 24 hours"
      },
      "average_time_to_first_review_1d": {
        "type": "number",
        "title": "Average Time to First Review (1 day)",
        "description": "Average days between PR creation and first review in the last 24 hours"
      },
      "pr_success_rate_1d": {
        "type": "number",
        "title": "PR Success Rate (1 day)",
        "description": "Percentage of PRs successfully merged in the last 24 hours"
      },
      "total_prs_1d": {
        "type": "number",
        "title": "Total PRs (1 day)",
        "description": "Total number of PRs processed in the last 24 hours"
      },
      "total_merged_prs_1d": {
        "type": "number",
        "title": "Total Merged PRs (1 day)",
        "description": "Total number of merged PRs in the last 24 hours"
      },
      "contribution_standard_deviation_1d": {
        "type": "number",
        "title": "Contribution Standard Deviation (1 day)",
        "description": "Standard deviation of the number of contributions per person in the last 24 hours"
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

Note
- The blueprint above shows only the 1-day metrics. The full blueprint includes similar properties for 7d, 30d, 60d, and 90d periods.
