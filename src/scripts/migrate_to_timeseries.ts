import { calculateAndStoreTimeSeriesServiceMetrics } from '../github/service_metrics_processor';
import { PortClient } from '../clients/port';
import type { Repository } from '../types/github';

/**
 * Migration script to transition from aggregated metrics to time-series metrics
 */
async function migrateToTimeSeriesMetrics() {
  const portClient = await PortClient.getInstance();
  
  try {
    console.log('Starting migration to time-series metrics...');

    // 1. Fetch all existing services from the service blueprint
    console.log('Fetching existing services...');
    const servicesResponse = await portClient.getEntities('service');
    
    if (!servicesResponse.ok || !servicesResponse.entities) {
      throw new Error('Failed to fetch services from Port');
    }

    const services = servicesResponse.entities;
    console.log(`Found ${services.length} services to process`);

    // 2. Convert Port entities to Repository format
    const repositories: Repository[] = services.map(service => ({
      id: parseInt(service.identifier || '0'),
      name: service.title || 'Unknown',
      owner: {
        login: (service.properties?.organization as string) || 'unknown',
      },
    })).filter(repo => repo.id > 0);

    console.log(`Converted ${repositories.length} services to repository format`);

    // 3. Get GitHub token from environment
    const authToken = process.env.GITHUB_TOKEN;
    if (!authToken) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    // 4. Process time-series metrics for each period type
    console.log('\nProcessing daily metrics...');
    await calculateAndStoreTimeSeriesServiceMetrics(
      repositories,
      authToken,
      'daily',
      90
    );

    console.log('\nProcessing weekly metrics...');
    await calculateAndStoreTimeSeriesServiceMetrics(
      repositories,
      authToken,
      'weekly',
      90
    );

    console.log('\nProcessing monthly metrics...');
    await calculateAndStoreTimeSeriesServiceMetrics(
      repositories,
      authToken,
      'monthly',
      90
    );

    console.log('\nMigration completed successfully!');
    console.log(`Processed ${repositories.length} services for daily, weekly, and monthly metrics`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Clean up old aggregated metrics (optional)
 * Run this only after confirming the new time-series metrics are working correctly
 */
async function cleanupOldMetrics() {
  const portClient = await PortClient.getInstance();
  
  try {
    console.log('Starting cleanup of old aggregated metrics...');

    // Fetch all service entities
    const servicesResponse = await portClient.getEntities('service');
    
    if (!servicesResponse.ok || !servicesResponse.entities) {
      throw new Error('Failed to fetch services from Port');
    }

    const services = servicesResponse.entities;
    console.log(`Found ${services.length} services to clean up`);

    // Remove old aggregated metrics properties
    for (const service of services) {
      if (!service.identifier) continue;

      const oldMetricsProperties = [
        'number_of_prs_reviewed_1d', 'number_of_prs_reviewed_7d', 'number_of_prs_reviewed_30d', 'number_of_prs_reviewed_60d', 'number_of_prs_reviewed_90d',
        'number_of_prs_merged_without_review_1d', 'number_of_prs_merged_without_review_7d', 'number_of_prs_merged_without_review_30d', 'number_of_prs_merged_without_review_60d', 'number_of_prs_merged_without_review_90d',
        'percentage_of_prs_reviewed_1d', 'percentage_of_prs_reviewed_7d', 'percentage_of_prs_reviewed_30d', 'percentage_of_prs_reviewed_60d', 'percentage_of_prs_reviewed_90d',
        'percentage_of_prs_merged_without_review_1d', 'percentage_of_prs_merged_without_review_7d', 'percentage_of_prs_merged_without_review_30d', 'percentage_of_prs_merged_without_review_60d', 'percentage_of_prs_merged_without_review_90d',
        'average_time_to_first_review_1d', 'average_time_to_first_review_7d', 'average_time_to_first_review_30d', 'average_time_to_first_review_60d', 'average_time_to_first_review_90d',
        'pr_success_rate_1d', 'pr_success_rate_7d', 'pr_success_rate_30d', 'pr_success_rate_60d', 'pr_success_rate_90d',
        'total_prs_1d', 'total_prs_7d', 'total_prs_30d', 'total_prs_60d', 'total_prs_90d',
        'total_merged_prs_1d', 'total_merged_prs_7d', 'total_merged_prs_30d', 'total_merged_prs_60d', 'total_merged_prs_90d',
        'contribution_standard_deviation_1d', 'contribution_standard_deviation_7d', 'contribution_standard_deviation_30d', 'contribution_standard_deviation_60d', 'contribution_standard_deviation_90d',
      ];

      // Create a properties object with null values to remove the properties
      const propertiesToRemove: Record<string, null> = {};
      oldMetricsProperties.forEach(prop => {
        propertiesToRemove[prop] = null;
      });

      await portClient.upsertProps('service', service.identifier, propertiesToRemove);
      console.log(`Cleaned up old metrics for service: ${service.title}`);
    }

    console.log('Cleanup completed successfully!');

  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}

// Export functions for use in other files
export { migrateToTimeSeriesMetrics, cleanupOldMetrics };

// Run migration if this file is executed directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'cleanup') {
    cleanupOldMetrics()
      .then(() => {
        console.log('Cleanup completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Cleanup failed:', error);
        process.exit(1);
      });
  } else {
    migrateToTimeSeriesMetrics()
      .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
} 