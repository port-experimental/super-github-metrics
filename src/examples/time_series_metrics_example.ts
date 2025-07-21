import { calculateAndStoreTimeSeriesServiceMetrics } from '../github/service_metrics_processor';

/**
 * Example usage of the time-series service metrics processor
 */
async function exampleTimeSeriesMetrics() {
  // Example repositories (you would typically fetch these from your service blueprint)
  const exampleRepos = [
    {
      id: 123456789,
      name: 'example-service',
      owner: {
        login: 'your-org',
      },
    },
    {
      id: 987654321,
      name: 'another-service',
      owner: {
        login: 'your-org',
      },
    },
  ];

  const authToken = process.env.GITHUB_TOKEN;
  if (!authToken) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  try {
    console.log('Starting time-series service metrics calculation...');

    // Process daily metrics for the last 90 days
    await calculateAndStoreTimeSeriesServiceMetrics(
      exampleRepos,
      authToken,
      'daily',
      90
    );

    console.log('Daily metrics processing completed successfully!');

    // Process weekly metrics for the last 90 days
    await calculateAndStoreTimeSeriesServiceMetrics(
      exampleRepos,
      authToken,
      'weekly',
      90
    );

    console.log('Weekly metrics processing completed successfully!');

    // Process monthly metrics for the last 90 days
    await calculateAndStoreTimeSeriesServiceMetrics(
      exampleRepos,
      authToken,
      'monthly',
      90
    );

    console.log('Monthly metrics processing completed successfully!');

  } catch (error) {
    console.error('Error processing time-series metrics:', error);
    throw error;
  }
}

// Export for use in other files
export { exampleTimeSeriesMetrics };

// Run the example if this file is executed directly
if (require.main === module) {
  exampleTimeSeriesMetrics()
    .then(() => {
      console.log('Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Example failed:', error);
      process.exit(1);
    });
} 