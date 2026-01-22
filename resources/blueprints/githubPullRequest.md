# Blueprint: githubPullRequest

Purpose
- Stores pull request performance metrics (size, lifetime, pickup/approve/merge times, maturity, review participation).

Port blueprint identifier
- `githubPullRequest`

Entity identifier example
- Repository name + PR number (example: `payments-api1234`).

Relations
- `service` -> `service` (uses repository name as the service identifier).

Populated by
- `pr-metrics`

Blueprint definition
```json
{
  "identifier": "githubPullRequest",
  "title": "GitHub Pull Request",
  "icon": "GitPullRequest",
  "schema": {
    "properties": {
      "pr_size": {
        "type": "number",
        "title": "PR Size",
        "description": "Total lines added + deleted"
      },
      "pr_lifetime": {
        "type": "number",
        "title": "PR Lifetime",
        "description": "Time from creation to close in days"
      },
      "pr_pickup_time": {
        "type": "number",
        "title": "PR Pickup Time",
        "description": "Time from creation to first review in days"
      },
      "pr_approve_time": {
        "type": "number",
        "title": "PR Approve Time",
        "description": "Time from first review to first approval in days"
      },
      "pr_merge_time": {
        "type": "number",
        "title": "PR Merge Time",
        "description": "Time from first approval to PR merge in days"
      },
      "pr_maturity": {
        "type": "number",
        "title": "PR Maturity",
        "description": "Ratio of changes added after PR publication vs total changes (0.0 to 1.0)"
      },
      "pr_success_rate": {
        "type": "number",
        "title": "PR Success Rate",
        "description": "1 if merged, 0 if closed without merge"
      },
      "review_participation": {
        "type": "number",
        "title": "Review Participation",
        "description": "Number of reviews on this PR"
      },
      "number_of_line_changes_after_pr_is_opened": {
        "type": "number",
        "title": "Line Changes After PR Opened",
        "description": "Total lines changed after PR creation"
      },
      "number_of_commits_after_pr_is_opened": {
        "type": "number",
        "title": "Commits After PR Opened",
        "description": "Number of commits after PR creation"
      }
    },
    "required": []
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "aggregationProperties": {},
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
