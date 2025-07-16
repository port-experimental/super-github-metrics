# Developer Onboarding Metrics

## Overview

Want to see each developer's time to first and tenth commit and PR? Want to also persist their join date to your GitHub Org?

This integration will help you import this data from GitHub into Port, from where you can integrate into your scorecards, dashboards and more.

## Caveats

In order to fetch data on when each user joined your GitHub org, we need to query your Audit Log. This is only available to GitHub Enterprise users today.

## Setup

1. Clone repo
1. Setup the code and workflow configuration in a central repository. I'd recommend creating one `.port` repository for all of your GitHub actions for custom integrations and self-service actions
1. For your repository that will run the github actions, configure repository secrets for the following environmental variables:

        - X_GITHUB_ORG
        - X_GITHUB_ENTERPRISE
        - X_GITHUB_AUTH_TOKEN
        - PORT_CLIENT_ID
        - PORT_CLIENT_SECRET
1. Modify your `github_user` blueprint in port to include the properties `first_commit`, `tenth_commit`, `first_pr`, `tenth_pr` (see an example blueprint below)
1. Have fun!

#### Blueprint Template
```json
{
  "identifier": "githubUser",
  "title": "Github User",
  "icon": "Github",
  "schema": {
    "properties": {
      "email": {
        "title": "Email",
        "type": "string"
      },
      "join_date": {
        "type": "string",
        "title": "Join Date",
        "description": "The date that the user joined our Github Enterprise",
        "format": "date-time"
      },
      "first_commit": {
        "type": "string",
        "title": "First Commit",
        "description": "The date of the user's first commit",
        "format": "date-time"
      },
      "first_pr": {
        "type": "string",
        "title": "First PR",
        "description": "The date of the user's first PR",
        "format": "date-time"
      },
      "tenth_commit": {
        "type": "string",
        "title": "Tenth Commit",
        "description": "The date of the user's tenth commit",
        "format": "date-time"
      },
      "tenth_pr": {
        "type": "string",
        "title": "Tenth PR",
        "description": "The date of the user's tenth PR",
        "format": "date-time"
      }
    },
    "required": []
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "aggregationProperties": {},
  "relations": {
    "user": {
      "title": "User",
      "target": "_user",
      "required": false,
      "many": false
    }
  }
}
```

# GitHub PR Metrics

## Overview

Track detailed metrics for individual pull requests including size, lifetime, review participation, and success rates. This integration provides granular insights into your development workflow efficiency.

## Setup

1. Ensure you have the same environment variables configured as the onboarding metrics
2. Create a `githubPullRequest` blueprint in Port (see template below)
3. Run the PR metrics collection

**Note:** If you already have a `githubPullRequest` blueprint, you can update it to include the new properties.

#### Blueprint Template
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
        "description": "Time from creation to close in hours"
      },
      "pr_pickup_time": {
        "type": "number",
        "title": "PR Pickup Time",
        "description": "Time from creation to first review in hours"
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
  "relations": {}
}
```

# GitHub Service Metrics

## Overview

Monitor repository-level code review quality and efficiency metrics across multiple time periods. This integration tracks review coverage, merge practices, review response times, and PR success rates to help identify trends and areas for process improvement.

## Metrics Collected

For each time period (1, 7, 30, 60, and 90 days), the following metrics are calculated:

- **Number of PRs Reviewed**: Count of PRs that received at least one review
- **Number of PRs Merged Without Review**: Count of PRs merged without any reviews
- **Percentage of PRs Reviewed**: (reviewed PRs / total PRs) × 100
- **Percentage of PRs Merged Without Review**: (merged without review / total merged PRs) × 100
- **Average Time to First Review**: Average hours between PR creation and first review
- **PR Success Rate**: (successfully merged PRs / total PRs) × 100
- **Total PRs**: Total number of PRs processed in the time period
- **Total Merged PRs**: Total number of merged PRs in the time period

## Time Periods

The service metrics are calculated for the following time periods:
- **1 day**: Last 24 hours
- **7 days**: Last week
- **30 days**: Last month
- **60 days**: Last 2 months
- **90 days**: Last 3 months

This allows you to track trends and identify both short-term and long-term patterns in your review processes.

## Setup

1. Ensure you have the same environment variables configured as other GitHub integrations
2. Create a `service` blueprint in Port (see template below)
3. Run the service metrics collection

**Note:** If you already have a `service` blueprint, you can update it to include the new properties.

#### Blueprint Template
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
        "description": "Average hours between PR creation and first review in the last 24 hours"
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
      "number_of_prs_reviewed_7d": {
        "type": "number",
        "title": "Number of PRs Reviewed (7 days)",
        "description": "Count of PRs that received at least one review in the last 7 days"
      },
      "number_of_prs_merged_without_review_7d": {
        "type": "number",
        "title": "Number of PRs Merged Without Review (7 days)",
        "description": "Count of PRs merged without any reviews in the last 7 days"
      },
      "percentage_of_prs_reviewed_7d": {
        "type": "number",
        "title": "Percentage of PRs Reviewed (7 days)",
        "description": "Percentage of PRs that received reviews in the last 7 days"
      },
      "percentage_of_prs_merged_without_review_7d": {
        "type": "number",
        "title": "Percentage of PRs Merged Without Review (7 days)",
        "description": "Percentage of merged PRs that had no reviews in the last 7 days"
      },
      "average_time_to_first_review_7d": {
        "type": "number",
        "title": "Average Time to First Review (7 days)",
        "description": "Average hours between PR creation and first review in the last 7 days"
      },
      "pr_success_rate_7d": {
        "type": "number",
        "title": "PR Success Rate (7 days)",
        "description": "Percentage of PRs successfully merged in the last 7 days"
      },
      "total_prs_7d": {
        "type": "number",
        "title": "Total PRs (7 days)",
        "description": "Total number of PRs processed in the last 7 days"
      },
      "total_merged_prs_7d": {
        "type": "number",
        "title": "Total Merged PRs (7 days)",
        "description": "Total number of merged PRs in the last 7 days"
      },
      "number_of_prs_reviewed_30d": {
        "type": "number",
        "title": "Number of PRs Reviewed (30 days)",
        "description": "Count of PRs that received at least one review in the last 30 days"
      },
      "number_of_prs_merged_without_review_30d": {
        "type": "number",
        "title": "Number of PRs Merged Without Review (30 days)",
        "description": "Count of PRs merged without any reviews in the last 30 days"
      },
      "percentage_of_prs_reviewed_30d": {
        "type": "number",
        "title": "Percentage of PRs Reviewed (30 days)",
        "description": "Percentage of PRs that received reviews in the last 30 days"
      },
      "percentage_of_prs_merged_without_review_30d": {
        "type": "number",
        "title": "Percentage of PRs Merged Without Review (30 days)",
        "description": "Percentage of merged PRs that had no reviews in the last 30 days"
      },
      "average_time_to_first_review_30d": {
        "type": "number",
        "title": "Average Time to First Review (30 days)",
        "description": "Average hours between PR creation and first review in the last 30 days"
      },
      "pr_success_rate_30d": {
        "type": "number",
        "title": "PR Success Rate (30 days)",
        "description": "Percentage of PRs successfully merged in the last 30 days"
      },
      "total_prs_30d": {
        "type": "number",
        "title": "Total PRs (30 days)",
        "description": "Total number of PRs processed in the last 30 days"
      },
      "total_merged_prs_30d": {
        "type": "number",
        "title": "Total Merged PRs (30 days)",
        "description": "Total number of merged PRs in the last 30 days"
      },
      "number_of_prs_reviewed_60d": {
        "type": "number",
        "title": "Number of PRs Reviewed (60 days)",
        "description": "Count of PRs that received at least one review in the last 60 days"
      },
      "number_of_prs_merged_without_review_60d": {
        "type": "number",
        "title": "Number of PRs Merged Without Review (60 days)",
        "description": "Count of PRs merged without any reviews in the last 60 days"
      },
      "percentage_of_prs_reviewed_60d": {
        "type": "number",
        "title": "Percentage of PRs Reviewed (60 days)",
        "description": "Percentage of PRs that received reviews in the last 60 days"
      },
      "percentage_of_prs_merged_without_review_60d": {
        "type": "number",
        "title": "Percentage of PRs Merged Without Review (60 days)",
        "description": "Percentage of merged PRs that had no reviews in the last 60 days"
      },
      "average_time_to_first_review_60d": {
        "type": "number",
        "title": "Average Time to First Review (60 days)",
        "description": "Average hours between PR creation and first review in the last 60 days"
      },
      "pr_success_rate_60d": {
        "type": "number",
        "title": "PR Success Rate (60 days)",
        "description": "Percentage of PRs successfully merged in the last 60 days"
      },
      "total_prs_60d": {
        "type": "number",
        "title": "Total PRs (60 days)",
        "description": "Total number of PRs processed in the last 60 days"
      },
      "total_merged_prs_60d": {
        "type": "number",
        "title": "Total Merged PRs (60 days)",
        "description": "Total number of merged PRs in the last 60 days"
      },
      "number_of_prs_reviewed_90d": {
        "type": "number",
        "title": "Number of PRs Reviewed (90 days)",
        "description": "Count of PRs that received at least one review in the last 90 days"
      },
      "number_of_prs_merged_without_review_90d": {
        "type": "number",
        "title": "Number of PRs Merged Without Review (90 days)",
        "description": "Count of PRs merged without any reviews in the last 90 days"
      },
      "percentage_of_prs_reviewed_90d": {
        "type": "number",
        "title": "Percentage of PRs Reviewed (90 days)",
        "description": "Percentage of PRs that received reviews in the last 90 days"
      },
      "percentage_of_prs_merged_without_review_90d": {
        "type": "number",
        "title": "Percentage of PRs Merged Without Review (90 days)",
        "description": "Percentage of merged PRs that had no reviews in the last 90 days"
      },
      "average_time_to_first_review_90d": {
        "type": "number",
        "title": "Average Time to First Review (90 days)",
        "description": "Average hours between PR creation and first review in the last 90 days"
      },
      "pr_success_rate_90d": {
        "type": "number",
        "title": "PR Success Rate (90 days)",
        "description": "Percentage of PRs successfully merged in the last 90 days"
      },
      "total_prs_90d": {
        "type": "number",
        "title": "Total PRs (90 days)",
        "description": "Total number of PRs processed in the last 90 days"
      },
      "total_merged_prs_90d": {
        "type": "number",
        "title": "Total Merged PRs (90 days)",
        "description": "Total number of merged PRs in the last 90 days"
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

# GitHub Workflow Metrics

## Overview

Track CI/CD workflow performance and reliability metrics across your repositories. Monitor workflow success rates, execution times, and failure patterns to optimize your development pipeline.

## Setup

1. Ensure you have the same environment variables configured as other GitHub integrations
2. Create a `githubWorkflow` blueprint in Port
3. Run the workflow metrics collection

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

# Usage

## CLI Commands

This project provides several CLI commands for different integrations:

### GitHub Integrations

```bash
# Developer onboarding metrics
npm run github-sync onboarding-metrics

# PR metrics
npm run github-sync pr-metrics

# Service metrics (review quality)
npm run github-sync service-metrics

# Workflow metrics
npm run github-sync workflow-metrics
```

### Coder Integrations

```bash
# Fetch templates
npm run coder-integration fetch-templates

# Fetch workspaces
npm run coder-integration fetch-workspaces

# Create workspace
npm run coder-integration create-workspace --name "my-workspace" --template "template-id" --ttl 86400000
```

## Environment Variables

### GitHub Integrations
- `PORT_CLIENT_ID` - Port client ID
- `PORT_CLIENT_SECRET` - Port client secret
- `X_GITHUB_TOKEN` - GitHub personal access token
- `X_GITHUB_ENTERPRISE` - GitHub Enterprise name
- `X_GITHUB_ORGS` - Comma-separated list of GitHub organizations

### Coder Integrations
- `PORT_CLIENT_ID` - Port client ID
- `PORT_CLIENT_SECRET` - Port client secret
- `CODER_SESSION_TOKEN` - Coder session token
- `CODER_API_BASE_URL` - Coder API base URL
- `CODER_ORGANIZATION_ID` - Coder organization ID

