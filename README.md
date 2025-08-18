# GitHub Metrics for Port

This repository contains a comprehensive set of scripts that fetch additional data not provided by Port's standard GitHub integration, upserting it into Port for enhanced metrics and insights into your GitHub organization. These integrations help you track developer onboarding, PR performance, service metrics, workflow reliability, and more.

## Overview

The GitHub Metrics for Port project provides several specialized integrations that extend Port's native GitHub capabilities:

- **Developer Onboarding Metrics**: Track developer journey from first commit to tenth PR
- **PR Metrics**: Detailed pull request performance and lifecycle analysis
- **Service Metrics**: Repository-level code review quality and efficiency tracking
- **Workflow Metrics**: CI/CD pipeline performance and reliability monitoring
- **Time-Series Service Metrics**: Historical trend analysis for dashboard visualizations
- **Coder Integration**: Development workspace and template management

## Environment Variables

### Required Environment Variables

All integrations require these core environment variables:

- `PORT_CLIENT_ID` - Your Port client ID
- `PORT_CLIENT_SECRET` - Your Port client secret

### GitHub-Specific Variables

For GitHub integrations, you'll also need:

**GitHub App Authentication (Recommended):**
- `X_GITHUB_APP_ID` - GitHub App ID
- `X_GITHUB_APP_PRIVATE_KEY` - GitHub App private key (PEM format)
- `X_GITHUB_APP_INSTALLATION_ID` - GitHub App installation ID

**OR Personal Access Token Authentication (Fallback):**
- `X_GITHUB_TOKEN` - Personal Access Token (can be comma-separated for token rotation)

**Additional Configuration:**
- `X_GITHUB_ENTERPRISE` - GitHub Enterprise name (if using GitHub Enterprise)
- `X_GITHUB_ORGS` - Comma-separated list of GitHub organizations to monitor

### Optional Variables

- `FORCE_ONBOARDING_METRICS` - Set to 'true' to process all users regardless of existing metrics
- `ONBOARDING_BATCH_SIZE` - Number of users to process concurrently (default: 3)

### Coder-Specific Variables

For Coder integration:

- `CODER_SESSION_TOKEN` - Coder session token
- `CODER_API_BASE_URL` - Coder API base URL
- `CODER_ORGANIZATION_ID` - Coder organization ID

## GitHub Setup

### Authentication Methods

This project supports two authentication methods with automatic detection:

#### GitHub App Authentication (Recommended)

GitHub App authentication provides better security, higher rate limits, and automatic token management:

1. **Create a GitHub App** in your organization:
   - Go to your organization settings
   - Navigate to Developer settings > GitHub Apps
   - Click "New GitHub App"
   - Configure the app with appropriate permissions

2. **Required Permissions**:
   - Repository permissions: Read access to code, pull requests, issues, and metadata
   - Organization permissions: Read access to members (for onboarding metrics), Audit Log (for onboarding metrics)
   - User permissions: Read access to email addresses

3. **Install the App**:
   - Install the app on the repositories you want to monitor
   - Note the installation ID for the `X_GITHUB_APP_INSTALLATION_ID` variable

4. **Generate Private Key**:
   - Download the private key from your GitHub App settings
   - Use the entire PEM content for `X_GITHUB_APP_PRIVATE_KEY`

5. **Set Environment Variables**:
   ```bash
   X_GITHUB_APP_ID=your_app_id
   X_GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   X_GITHUB_APP_INSTALLATION_ID=your_installation_id
   ```

#### Personal Access Token Authentication (Fallback)

If you prefer to use a Personal Access Token:

1. **Create Personal Access Token(s)**:
   - Go to your GitHub settings
   - Navigate to Developer settings > Personal access tokens
   - Generate one or more tokens with appropriate permissions
   - For token rotation, create multiple tokens to increase rate limits

2. **Required Permissions**:
   - `repo` - Full control of private repositories
   - `read:org` - Read organization data
   - `read:user` - Read user data

3. **Set Environment Variable**:
```bash
   # Single token
X_GITHUB_TOKEN=ghp_your_token_here

   # Multiple tokens for rotation (comma-separated)
X_GITHUB_TOKEN=ghp_token1,ghp_token2,ghp_token3
```

4. **Token Rotation Benefits**:
   - **Increased Rate Limits**: Each token provides 5000 requests per hour
   - **Automatic Rotation**: System automatically switches to the best available token
   - **Smart Selection**: Chooses token with the most remaining requests
   - **Fault Tolerance**: Continues operation if one token is exhausted
   - **Efficient Monitoring**: Uses response headers for real-time rate limit tracking
   - **Automatic Recovery**: Waits for rate limit reset when all tokens are exhausted
   - **Exponential Backoff**: Intelligent retry logic for transient failures

### Authentication Priority

The system automatically detects which authentication method to use:

1. **GitHub App** (preferred): If all three GitHub App environment variables are set
2. **Personal Access Token** (fallback): If `X_GITHUB_TOKEN` is set
3. **Error**: If neither method is properly configured

### GitHub Enterprise Considerations

If you're using GitHub Enterprise:
- Set `X_GITHUB_ENTERPRISE` to your enterprise name
- Ensure your GitHub App is configured for your enterprise instance
- Note that audit log access (required for onboarding metrics) is only available to GitHub Enterprise users

---

# Developer Onboarding Metrics

## Overview

Track each developer's journey from joining your organization through their first and tenth commits and pull requests. This integration helps you measure onboarding effectiveness and identify areas for improvement in your developer experience.

## Data Collected

- **Join Date**: When the developer joined your GitHub organization
- **First Commit**: Date of the developer's first commit
- **Tenth Commit**: Date of the developer's tenth commit
- **First PR Date**: Date of the developer's first pull request
- **Tenth PR Date**: Date of the developer's tenth pull request
- **Time to First Commit**: Days between join date and first commit
- **Time to First PR**: Days between join date and first PR
- **Time to 10th Commit**: Days between join date and tenth commit
- **Time to 10th PR**: Days between join date and tenth PR
- **Initial Review Response Time**: Time from first PR to first review

## Blueprints to Create

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

## How to Run It

```bash
# Process only users without complete metrics (default)
npm run onboarding-metrics

# Process all users regardless of existing metrics
FORCE_ONBOARDING_METRICS=true npm run onboarding-metrics
```

---

# GitHub PR Metrics

## Overview

Track detailed metrics for individual pull requests including size, lifetime, review participation, and success rates. This integration provides granular insights into your development workflow efficiency and helps identify bottlenecks in your review process.

## Data Collected

- **PR Size**: Total lines added + deleted
- **PR Lifetime**: Time from creation to close in days
- **PR Pickup Time**: Time from creation to first review in days
- **PR Approve Time**: Time from first review to first approval in days
- **PR Merge Time**: Time from first approval to PR merge in days
- **PR Maturity**: Ratio of changes added after PR publication vs total changes (0.0 to 1.0)
- **PR Success Rate**: 1 if merged, 0 if closed without merge
- **Review Participation**: Number of reviews on this PR
- **Line Changes After PR Opened**: Total lines changed after PR creation
- **Commits After PR Opened**: Number of commits after PR creation

## Blueprints to Create

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

*Note*: The `service` relation uses the repository name as the service identifier.

## How to Run It

```bash
npm run pr-metrics
```

---

# GitHub Service Metrics

## Overview

Monitor repository-level code review quality and efficiency metrics across multiple time periods. This integration tracks review coverage, merge practices, review response times, and PR success rates to help identify trends and areas for process improvement.

## Data Collected

For each time period (1, 7, 30, 60, and 90 days):

- **Number of PRs Reviewed**: Count of PRs that received at least one review
- **Number of PRs Merged Without Review**: Count of PRs merged without any reviews
- **Percentage of PRs Reviewed**: (reviewed PRs / total PRs) × 100
- **Percentage of PRs Merged Without Review**: (merged without review / total merged PRs) × 100
- **Average Time to First Review**: Average days between PR creation and first review
- **PR Success Rate**: (successfully merged PRs / total PRs) × 100
- **Total PRs**: Total number of PRs processed in the time period
- **Total Merged PRs**: Total number of merged PRs in the time period
- **Contribution Standard Deviation**: Standard deviation of the number of contributions per person

## Blueprints to Create

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

*Note: The blueprint above shows only the 1-day metrics. The full blueprint includes similar properties for 7d, 30d, 60d, and 90d periods.*

## How to Run It

```bash
npm run service-metrics
```

---

# Time-Series Service Metrics

## Overview

Generate time-series metrics for services to enable better dashboard visualizations with line charts and trend analysis. This integration creates individual data points for each time period, allowing you to track historical trends and patterns in your development processes.

## Data Collected

For each time period (daily, weekly, or monthly):

- **Period**: The time period this metric represents (ISO8601 datetime format)
- **Period Type**: The type of time period (daily, weekly, monthly)
- **Total PRs**: Total number of pull requests in this period
- **Total Merged PRs**: Total number of merged pull requests in this period
- **Number of PRs Reviewed**: Number of pull requests that received at least one review
- **Number of PRs Merged Without Review**: Number of pull requests merged without any reviews
- **Percentage of PRs Reviewed**: Percentage of pull requests that received at least one review
- **Percentage of PRs Merged Without Review**: Percentage of pull requests merged without any reviews
- **Average Time to First Review**: Average time in days from PR creation to first review
- **PR Success Rate**: Percentage of pull requests that were successfully merged
- **Contribution Standard Deviation**: Standard deviation of contribution counts across contributors
- **Calculated At**: Timestamp when these metrics were calculated
- **Data Source**: Source of the metrics data (default: github)

## Blueprints to Create

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

*Note*: The `service` relation uses the repository name as the service identifier.

## How to Run It

```bash
# Process daily metrics for the last 90 days (default)
npm run timeseries-service-metrics

# Process weekly metrics for the last 90 days
npm run timeseries-service-metrics --period-type weekly

# Process monthly metrics for the last 90 days
npm run timeseries-service-metrics --period-type monthly

# Process daily metrics for the last 30 days
npm run timeseries-service-metrics --period-type daily --days-back 30
```

---

# GitHub Workflow Metrics

## Overview

Track CI/CD workflow performance and reliability metrics across your repositories. Monitor workflow success rates, execution times, and failure patterns to optimize your development pipeline and identify areas for improvement.

## Data Collected

- **Workflow Name**: Name of the GitHub workflow
- **Repository**: GitHub repository where the workflow is defined
- **Success Rate**: Percentage of successful workflow runs in the last 30 days
- **Average Duration**: Average execution time of the workflow in minutes
- **Total Runs**: Total number of workflow runs in the last 30 days
- **Last Run Status**: Status of the most recent workflow run
- **Last Run Date**: Date and time of the most recent workflow run

## Blueprints to Create

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

*Note*: The `repository` relation uses the repository name as the repository identifier.

## How to Run It

```bash
npm run workflow-metrics
```

---

# Coder Integration

## Overview

Catalog all of your Coder.com development workspaces and available templates in Port. Enable your developers to provision workspaces with self-service actions, providing better visibility and control over your development environment resources.

## Data Collected

### Templates
- Owner information (name, ID)
- Organization details
- Active version and user count
- Creation metadata
- Default TTL settings
- Deprecation status and messages
- Template description

### Workspaces
- Owner information
- TTL and cost data
- Automatic update settings
- Creation and lifecycle dates
- Health status
- Build information
- Organization details

## Blueprints to Create

### Coder Template
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

### Coder Workspace
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

## How to Run It

```bash
# Fetch templates
npm run coder-integration fetch-templates

# Fetch workspaces
npm run coder-integration fetch-workspaces

# Create workspace
npm run coder-integration create-workspace --name "my-workspace" --template "template-id" --ttl 86400000
```

---

# Development

## Running Tests

This project uses [Biome](https://biomejs.dev/) for formatting and linting. Biome is a fast formatter and linter that replaces Prettier, ESLint, and other tools.

### Available Scripts

- `npm run format` - Format all files
- `npm run format:check` - Check if files are formatted (useful in CI)
- `npm run lint` - Lint all files
- `npm run lint:fix` - Fix auto-fixable linting issues
- `npm run check` - Run both formatting and linting checks
- `npm run check:fix` - Fix auto-fixable formatting and linting issues
- `npm run check:fix-unsafe` - Apply all fixes including unsafe ones
- `npm run pre-commit` - Run formatting and linting fixes (useful for pre-commit hooks)

### Configuration

The Biome configuration is in `biome.json` and includes:
- TypeScript support
- Import organization
- Consistent formatting (2 spaces, 100 char line width)
- Recommended linting rules
- Custom rules for code quality

## Architecture

### Port Client Architecture

The Port client uses a class-based architecture with automatic token management:

#### Key Features
- **Automatic Token Management**: Validates and regenerates tokens automatically
- **Singleton Pattern**: Ensures single client instance with shared token
- **Error Handling**: Automatic retry on 401 errors with token regeneration
- **Backward Compatibility**: Legacy function exports continue to work

#### Usage Examples

```typescript
// Instance-based usage (recommended)
const client = await PortClient.getInstance();
const users = await client.getUsers();
const entities = await client.getEntities('githubUser');

// Static method usage (convenient)
const users = await PortClient.getUsers();
const entities = await PortClient.getEntities('githubUser');

// Legacy function usage (backward compatible)
const users = await getUsers();
const entities = await getEntities('githubUser');
```

### GitHub Authentication

The system supports two authentication methods with automatic detection:

#### GitHub App Authentication (Preferred)
- **Automatic Token Generation**: Generates and refreshes installation access tokens automatically
- **Higher Rate Limits**: 5000 requests per hour per installation
- **Better Security**: Short-lived tokens with automatic refresh
- **Granular Permissions**: Fine-grained access control

#### Personal Access Token Authentication (Fallback)
- **Simple Setup**: Single token configuration
- **Token Rotation**: Support for multiple comma-separated tokens
- **Smart Selection**: Automatically chooses token with best rate limit status
- **Automatic Rotation**: Switches tokens when rate limits are exhausted
- **Efficient Rate Limiting**: Uses response headers instead of additional API calls
- **Automatic Recovery**: Waits for rate limit reset when all tokens are exhausted
- **Exponential Backoff**: Intelligent retry logic for transient failures
- **Standard Rate Limits**: 5000 requests per hour per token
- **Backward Compatibility**: Works with existing single token configurations

#### Authentication Detection
The system automatically detects which authentication method to use based on environment variables:

1. **GitHub App** (preferred): If `X_GITHUB_APP_ID`, `X_GITHUB_APP_PRIVATE_KEY`, and `X_GITHUB_APP_INSTALLATION_ID` are set
2. **Personal Access Token** (fallback): If `X_GITHUB_TOKEN` is set
3. **Error**: If neither method is properly configured

### Error Handling Strategy

The system implements a comprehensive error handling strategy:

#### Error Types
- **Fatal Errors**: Cause entire process to fail (missing env vars, auth failures, all repos failing)
- **Non-Fatal Errors**: Logged but allow process to continue (individual repo/PR failures)

#### Exit Codes
- **0**: Success (all operations completed successfully or with acceptable partial failures)
- **1**: Fatal error (process should be considered failed)

#### Error Propagation
- Individual repository failures are logged but don't fail the entire process
- All repository failures are treated as fatal errors
- Individual item failures (PRs, workflows) are logged but don't fail the repository

## Migration from Aggregated Metrics

To migrate from the old aggregated metrics to the new time-series approach:

**Option 1: GitHub Actions Workflow (Recommended)**
1. Create the `serviceMetrics` blueprint in Port (see blueprint template above)
2. Go to your repository's **Actions** tab
3. Select **migrate_to_timeseries** workflow
4. Configure parameters and run the migration
5. Update your dashboards to use the new time-series data

**Option 2: Command Line**
1. Create the `serviceMetrics` blueprint in Port (see blueprint template above)
2. Run the migration script: `npm run migrate-to-timeseries`
3. Update your dashboards to use the new time-series data
4. Optionally clean up old aggregated metrics: `npm run migrate-to-timeseries cleanup`

For detailed migration instructions, see [docs/timeseries_migration_workflow.md](./docs/timeseries_migration_workflow.md).

## Caveats

In order to fetch data on when each user joined your GitHub org, we need to query the organization's Audit Log. This is only available to GitHub Enterprise users today. 