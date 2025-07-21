# Service Metrics Dashboard

This document explains how to use the new time-series service metrics functionality for building dashboard visualizations in Port.

## Overview

The time-series service metrics system creates individual data points for each time period (daily, weekly, or monthly) instead of aggregating metrics across multiple time periods. This approach enables better dashboard visualizations with line charts and trend analysis.

## Architecture

### Blueprints

1. **Service Blueprint** (`service`) - Contains the main service entities
2. **Service Metrics Blueprint** (`serviceMetrics`) - Contains time-series metrics with a relation to services

### Data Structure

Each service metrics entity contains:
- **Period**: Time period identifier (e.g., "2024-01-15" for daily)
- **Period Type**: Type of time period (daily, weekly, monthly)
- **Metrics**: All the calculated metrics for that specific period
- **Relations**: Link to the parent service entity

## Usage

### 1. Create the Service Metrics Blueprint

First, create the `serviceMetrics` blueprint in Port using the schema defined in `src/github/service_metrics_blueprint.ts`.

### 2. Process Time-Series Metrics

```typescript
import { calculateAndStoreTimeSeriesServiceMetrics } from './src/github/service_metrics_processor';

// Process daily metrics for the last 90 days
await calculateAndStoreTimeSeriesServiceMetrics(
  repositories,
  githubToken,
  'daily',
  90
);

// Process weekly metrics for the last 90 days
await calculateAndStoreTimeSeriesServiceMetrics(
  repositories,
  githubToken,
  'weekly',
  90
);

// Process monthly metrics for the last 90 days
await calculateAndStoreTimeSeriesServiceMetrics(
  repositories,
  githubToken,
  'monthly',
  90
);
```

### 3. Building Dashboards

With the time-series data in place, you can now build dashboards in Port that show:

- **Line Charts**: Track metrics over time
- **Trend Analysis**: Identify patterns and trends
- **Comparative Analysis**: Compare metrics across different services
- **Performance Monitoring**: Monitor key metrics like PR success rate and review time

## Example Dashboard Queries

### Get All Metrics for a Service
```javascript
// Query all service metrics for a specific service
const serviceMetrics = await portClient.getEntities('serviceMetrics', {
  relations: {
    service: 'your-service-id'
  }
});
```

### Get Metrics for a Date Range
```javascript
// Query metrics for a specific date range
const metrics = await portClient.getEntities('serviceMetrics', {
  properties: {
    period: {
      $gte: '2024-01-01',
      $lte: '2024-01-31'
    },
    period_type: 'daily'
  }
});
```

### Get Latest Metrics
```javascript
// Get the most recent metrics for each service
const latestMetrics = await portClient.getEntities('serviceMetrics', {
  properties: {
    calculated_at: {
      $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
  }
});
```

## Metrics Available

Each time period contains the following metrics:

- **Total PRs**: Number of pull requests created
- **Total Merged PRs**: Number of pull requests merged
- **PRs Reviewed**: Number of PRs that received at least one review
- **PRs Merged Without Review**: Number of PRs merged without reviews
- **PR Review Percentage**: Percentage of PRs that received reviews
- **PR Merged Without Review Percentage**: Percentage of PRs merged without reviews
- **Average Time to First Review**: Average time in days from PR creation to first review
- **PR Success Rate**: Percentage of PRs that were successfully merged
- **Contribution Standard Deviation**: Standard deviation of contribution counts

## Period Types

### Daily
- Format: `YYYYMMDD` (e.g., "20240115")
- Best for: Detailed analysis and short-term trends

### Weekly
- Format: `YYYYWW` (e.g., "202403" for week 3 of 2024)
- Best for: Weekly reporting and medium-term trends

### Monthly
- Format: `YYYYMM` (e.g., "202401")
- Best for: Long-term trends and monthly reporting

## Identifier Format

Each service metrics entity has a compact identifier that fits within Port's 30-character limit:

- **Format**: `{serviceName}{periodType}{period}`
- **Example**: `my-service-d20240115` (service name "my-service", daily, January 15, 2024)
- **Period Type Codes**: 
  - `d` for daily
  - `w` for weekly  
  - `m` for monthly

The service name is automatically sanitized (non-alphanumeric characters replaced with hyphens) and truncated if needed to fit within the 30-character limit.

## Data Retention

Consider implementing a data retention policy to manage the number of metrics entities:

- **Daily metrics**: Keep for 90 days
- **Weekly metrics**: Keep for 1 year
- **Monthly metrics**: Keep for 3 years

## Performance Considerations

- The system fetches all PRs for the specified time period and then groups them by period
- For large repositories, consider processing metrics during off-peak hours
- Use appropriate time periods based on your dashboard needs (daily for detailed views, weekly/monthly for trends)

## Migration from Aggregated Metrics

If you're migrating from the old aggregated metrics system:

1. Keep the old system running for backward compatibility
2. Deploy the new time-series system alongside it
3. Update dashboards to use the new time-series data
4. Remove the old system once migration is complete

## Example Implementation

See `src/examples/time_series_metrics_example.ts` for a complete example of how to use the time-series metrics processor. 