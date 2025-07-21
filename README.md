# Developer Onboarding Metrics

## Overview

Want to see each developer's time to first and tenth commit and PR? Want to also persist their join date to your GitHub Org?

This integration will help you import this data from GitHub into Port, from where you can integrate into your scorecards, dashboards and more.

## Testing

The application includes a comprehensive test suite to ensure reliability and correctness.

### Running Tests

#### All Tests
```bash
npm test
```

#### Working Tests Only
```bash
npm run test:working
```

#### Specific Test Categories
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Client tests
npm run test:clients

# GitHub-specific tests
npm run test:github
```

#### Individual Test Files
```bash
npm test -- --testPathPatterns="filename.test.ts"
```

### Test Coverage

The test suite covers:

- ✅ **Basic Jest Functionality** (5 tests)
- ✅ **GitHub Utils - Data Filtering** (11 tests)
- ✅ **GitHub Utils - Helper Functions** (7 tests)
- 🔧 **PR Metrics** (structure created, needs type fixes)
- 🔧 **Service Metrics** (structure created, needs type fixes)
- 🔧 **Workflow Metrics** (structure created, needs type fixes)
- 🔧 **Port Client Integration** (structure created, needs type fixes)

### Test Infrastructure

- **Jest**: Test runner with TypeScript support
- **ts-jest**: TypeScript transformer for Jest
- **Mock System**: Comprehensive mocking for GitHub API and Port API
- **Test Utilities**: Helper functions and mock data structures

### Current Status

- **Total Test Suites**: 16
- **Passing Test Suites**: 3
- **Total Tests**: 23
- **Passing Tests**: 23

The working tests provide solid coverage of core functionality, while the remaining tests need TypeScript type fixes to resolve compilation errors.

For detailed test information, see [TEST_SUMMARY.md](./TEST_SUMMARY.md).

## Caveats

In order to fetch data on when each user joined your GitHub org, we need to query your Audit Log. This is only available to GitHub Enterprise users today.

## Development

### Code Quality

This project uses [Biome](https://biomejs.dev/) for formatting and linting. Biome is a fast formatter and linter that replaces Prettier, ESLint, and other tools.

#### Available Scripts

- `npm run format` - Format all files
- `npm run format:check` - Check if files are formatted (useful in CI)
- `npm run lint` - Lint all files
- `npm run lint:fix` - Fix auto-fixable linting issues
- `npm run check` - Run both formatting and linting checks
- `npm run check:fix` - Fix auto-fixable formatting and linting issues
- `npm run check:fix-unsafe` - Apply all fixes including unsafe ones
- `npm run pre-commit` - Run formatting and linting fixes (useful for pre-commit hooks)

#### Configuration

The Biome configuration is in `biome.json` and includes:
- TypeScript support
- Import organization
- Consistent formatting (2 spaces, 100 char line width)
- Recommended linting rules
- Custom rules for code quality

## Setup

1. Clone repo
1. Setup the code and workflow configuration in a central repository. I'd recommend creating one `.port` repository for all of your GitHub actions for custom integrations and self-service actions
1. For your repository that will run the github actions, configure repository secrets for the following environmental variables:

        - X_GITHUB_ORGS
        - X_GITHUB_ENTERPRISE
        - X_GITHUB_AUTH_TOKEN
        - PORT_CLIENT_ID
        - PORT_CLIENT_SECRET
1. Modify your `github_user` blueprint in port to include the properties `first_commit`, `tenth_commit`, `first_pr`, `tenth_pr` (see an example blueprint below)
1. Have fun!

### Force Processing All Users

By default, the onboarding metrics integration only processes users who don't already have complete onboarding metrics. However, you can force the integration to process all users regardless of their existing metrics by setting the `FORCE_ONBOARDING_METRICS` environment variable to `'true'`.

This is useful when you want to:
- Correct or update existing onboarding data
- Recalculate metrics after changes to the calculation logic
- Ensure all users have the most up-to-date metrics

**Example:**
```bash
# Process only users without complete metrics (default behavior)
npm run github-sync onboarding-metrics

# Process all users regardless of existing metrics
FORCE_ONBOARDING_METRICS=true npm run github-sync onboarding-metrics
```

**Note:** When force processing is enabled, the integration will overwrite existing onboarding metrics for all users. This may take longer to complete since it processes all users in your organization.

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
- **Average Time to First Review**: Average days between PR creation and first review
- **PR Success Rate**: (successfully merged PRs / total PRs) × 100
- **Total PRs**: Total number of PRs processed in the time period
- **Total Merged PRs**: Total number of merged PRs in the time period
- **Contribution Standard Deviation**: Standard deviation of the number of contributions per person (PRs, reviews, comments, issues)

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
        "description": "Average days between PR creation and first review in the last 7 days"
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
      "contribution_standard_deviation_7d": {
        "type": "number",
        "title": "Contribution Standard Deviation (7 days)",
        "description": "Standard deviation of the number of contributions per person in the last 7 days"
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
        "description": "Average days between PR creation and first review in the last 30 days"
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
      "contribution_standard_deviation_30d": {
        "type": "number",
        "title": "Contribution Standard Deviation (30 days)",
        "description": "Standard deviation of the number of contributions per person in the last 30 days"
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
        "description": "Average days between PR creation and first review in the last 60 days"
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
      "contribution_standard_deviation_60d": {
        "type": "number",
        "title": "Contribution Standard Deviation (60 days)",
        "description": "Standard deviation of the number of contributions per person in the last 60 days"
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
        "description": "Average days between PR creation and first review in the last 90 days"
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
      },
      "contribution_standard_deviation_90d": {
        "type": "number",
        "title": "Contribution Standard Deviation (90 days)",
        "description": "Standard deviation of the number of contributions per person in the last 90 days"
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

## Sample Blueprint

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
      "repository": {
        "type": "string",
        "title": "Repository",
        "description": "GitHub repository where the workflow is defined"
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
    "required": ["workflowName", "repository"]
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "relations": {
    "repository": {
      "title": "Repository",
      "target": "githubRepository",
      "required": true,
      "many": false
    }
  }
}
```

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

#### Service Metrics

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
        "description": "The time period this metric represents (YYYY-MM-DD for daily, YYYY-WNN for weekly, YYYY-MM for monthly)"
      },
      "period_type": {
        "type": "string",
        "title": "Period Type",
        "description": "The type of time period (daily, weekly, monthly)",
        "enum": ["daily", "weekly", "monthly"]
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

# Time-series service metrics (for dashboard visualizations)
npm run github-sync timeseries-service-metrics

# Workflow metrics
npm run github-sync workflow-metrics
```

### Time-Series Service Metrics

The time-series service metrics provide individual data points for each time period, enabling better dashboard visualizations with line charts and trend analysis.

#### CLI Options

```bash
# Process daily metrics for the last 90 days (default)
npm run github-sync timeseries-service-metrics

# Process weekly metrics for the last 90 days
npm run github-sync timeseries-service-metrics --period-type weekly

# Process monthly metrics for the last 90 days
npm run github-sync timeseries-service-metrics --period-type monthly

# Process daily metrics for the last 30 days
npm run github-sync timeseries-service-metrics --period-type daily --days-back 30
```

#### Automated Workflow

The `collect_timeseries_service_metrics` workflow automatically runs:

- **Daily metrics**: Every day at 2 AM UTC
- **Weekly metrics**: Every Monday at 3 AM UTC  
- **Monthly metrics**: On the 1st of every month at 4 AM UTC

You can also manually trigger the workflow with custom parameters through the GitHub Actions UI.

#### Migration from Aggregated Metrics

To migrate from the old aggregated metrics to the new time-series approach:

1. Create the `serviceMetrics` blueprint in Port (see blueprint template above)
2. Run the migration script: `npm run migrate-to-timeseries`
3. Update your dashboards to use the new time-series data
4. Optionally clean up old aggregated metrics: `npm run migrate-to-timeseries cleanup`

For detailed migration instructions, see [docs/timeseries_migration_guide.md](./docs/timeseries_migration_guide.md).

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
- `FORCE_ONBOARDING_METRICS` - Set to 'true' to process all users regardless of existing onboarding metrics (optional, defaults to false)

### Coder Integrations
- `PORT_CLIENT_ID` - Port client ID
- `PORT_CLIENT_SECRET` - Port client secret
- `CODER_SESSION_TOKEN` - Coder session token
- `CODER_API_BASE_URL` - Coder API base URL
- `CODER_ORGANIZATION_ID` - Coder organization ID

