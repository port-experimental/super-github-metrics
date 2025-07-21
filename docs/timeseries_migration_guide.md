# Time-Series Service Metrics Migration Guide

This guide explains how to migrate from the current aggregated service metrics to the new time-series approach for better dashboard visualizations.

## What's Changed

### Before (Aggregated Metrics)
- Single service entity with multiple time period metrics (1d, 7d, 30d, 60d, 90d)
- All metrics stored as properties on the service entity
- Limited ability to create time-series visualizations

### After (Time-Series Metrics)
- Separate `serviceMetrics` blueprint with individual entities for each time period
- Each metrics entity relates to a service entity
- Perfect for line charts and trend analysis
- More granular data for better insights

## Implementation Steps

### 1. Create the Service Metrics Blueprint

Create a new blueprint in Port with the identifier `serviceMetrics` using the schema from `src/github/service_metrics_blueprint.ts`.

### 2. Run the Migration Script

Use the provided migration script to generate time-series metrics for all existing services:

```bash
# Set required environment variables
export GITHUB_TOKEN="your-github-token"
export PORT_CLIENT_ID="your-port-client-id"
export PORT_CLIENT_SECRET="your-port-client-secret"

# Run the migration
npx ts-node src/scripts/migrate_to_timeseries.ts
```

### 3. Update Your Dashboard Queries

Replace old aggregated metrics queries with new time-series queries.

### 4. Create New Dashboards

With the time-series data, you can now create much more powerful dashboards with line charts and trend analysis.

### 5. Clean Up Old Metrics (Optional)

After confirming the new system works correctly, you can remove the old aggregated metrics.

## Benefits of the New Approach

1. **Better Visualizations**: Line charts, trend analysis, comparative analysis
2. **More Granular Data**: Daily, weekly, and monthly breakdowns
3. **Improved Querying**: Filter by date ranges, sort by time periods
4. **Scalability**: Each time period is a separate entity

## Next Steps

1. Test the migration on a test environment first
2. Update existing dashboards to use the new time-series data
3. Monitor performance during the transition
4. Remove old aggregated metrics once the new system is stable 