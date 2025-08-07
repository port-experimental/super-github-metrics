#!/usr/bin/env node

import { Command } from 'commander';
import { createGitHubClient, type GitHubClient } from '../clients/github';
import { getEntities, PortClient } from '../clients/port';
import type { GitHubUser, AuditLogEntry, Repository } from '../types/github';
import type { PortEntity } from '../types/port';
import {
  calculateAndStoreDeveloperStats,
  hasCompleteOnboardingMetrics,
} from './onboarding_metrics';
import { calculateAndStorePRMetrics } from './pr_metrics';
import { calculateAndStoreServiceMetrics } from './service_metrics';
import { calculateAndStoreTimeSeriesServiceMetrics } from './service_aggregated_metrics';
import { calculateWorkflowMetrics } from './workflow_metrics';
import { CONCURRENCY_LIMITS } from './utils';

if (process.env.GITHUB_ACTIONS !== 'true') {
  require('dotenv').config();
}

/**
 * Custom error class for fatal errors that should cause the process to exit
 */
class FatalError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'FatalError';
  }
}

/**
 * Processes repositories for a specific organization
 */
async function processOrganizationRepositories(
  githubClient: GitHubClient,
  orgName: string,
  processor: (repos: Repository[]) => Promise<void>
): Promise<void> {
  console.log(`Processing repositories for organization: ${orgName}`);
  const repos = await githubClient.fetchOrganizationRepositories(orgName);
  console.log(`Processing ${repos.length} repositories from ${orgName}`);
  await processor(repos);
}

async function main() {
  try {
    const GITHUB_APP_ID = process.env.X_GITHUB_APP_ID;
    const GITHUB_APP_PRIVATE_KEY = process.env.X_GITHUB_APP_PRIVATE_KEY;
    const GITHUB_APP_INSTALLATION_ID = process.env.X_GITHUB_APP_INSTALLATION_ID;
    const ENTERPRISE_NAME = process.env.X_GITHUB_ENTERPRISE;
    const GITHUB_ORGS = process.env.X_GITHUB_ORGS?.split(',');

    if (!GITHUB_APP_ID) {
      throw new FatalError('X_GITHUB_APP_ID environment variable is required');
    }
    if (!GITHUB_APP_PRIVATE_KEY) {
      throw new FatalError('X_GITHUB_APP_PRIVATE_KEY environment variable is required');
    }
    if (!GITHUB_APP_INSTALLATION_ID) {
      throw new FatalError('X_GITHUB_APP_INSTALLATION_ID environment variable is required');
    }
    if (!ENTERPRISE_NAME) {
      throw new FatalError('X_GITHUB_ENTERPRISE environment variable is required');
    }
    if (!GITHUB_ORGS || GITHUB_ORGS.length === 0) {
      throw new FatalError(
        'X_GITHUB_ORGS environment variable is required and must contain at least one organization'
      );
    }

    const program = new Command();

    program.name('github-sync').description('CLI to pull metrics from GitHub to Port');

    program
      .command('onboarding-metrics')
      .description('Send onboarding metrics to Port')
      .action(async () => {
        let hasFatalError = false;

        // Add timeout for the entire onboarding metrics process (45 minutes)
        const PROCESS_TIMEOUT = parseInt(process.env.ONBOARDING_PROCESS_TIMEOUT || '2700000', 10); // 45 minutes total by default
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Onboarding metrics process timeout')), PROCESS_TIMEOUT);
        });

        try {
          await Promise.race([
            (async () => {
              console.log('Calculating onboarding metrics...');
              const githubClient = createGitHubClient({
                appId: GITHUB_APP_ID,
                privateKey: GITHUB_APP_PRIVATE_KEY,
                installationId: GITHUB_APP_INSTALLATION_ID,
              });
              await githubClient.checkRateLimits();
              const githubUsers = await getEntities('githubUser');
              console.log(`Found ${githubUsers.entities.length} github users in Port`);

              let joinRecords: AuditLogEntry[] = [];
              // Try fetch join dates from the audit log for each organization concurrently
              try {
                console.log('Fetching member join dates from organization audit logs...');
                const auditLogPromises = GITHUB_ORGS.map(async (orgName) => {
                  try {
                    const orgJoinRecords = await githubClient.getMemberAddDates(orgName);
                    console.log(`Found ${orgJoinRecords.length} join records from ${orgName}`);
                    return orgJoinRecords;
                  } catch (error) {
                    if (error instanceof Error && 'status' in error && error.status === 403) {
                      console.log(
                        `Insufficient permissions to query audit log for ${orgName}. Skipping...`
                      );
                    } else {
                      console.warn(
                        `Failed to fetch join records from ${orgName}, continuing without them:`,
                        error
                      );
                    }
                    return [];
                  }
                });

                const auditLogResults = await Promise.all(auditLogPromises);
                joinRecords = auditLogResults.flat();
                console.log(`Total join records found: ${joinRecords.length}`);
              } catch (error) {
                console.warn('Failed to fetch join records, continuing without them:', error);
              }

              // Check if we should force processing all users regardless of existing metrics
              const forceProcessing = process.env.FORCE_ONBOARDING_METRICS === 'true';

              let usersToProcess: PortEntity[];
              if (forceProcessing) {
                console.log(
                  'FORCE_ONBOARDING_METRICS is enabled - processing all users regardless of existing metrics'
                );
                usersToProcess = githubUsers.entities;
              } else {
                // Only go over users without complete onboarding metrics in Port
                usersToProcess = githubUsers.entities.filter(
                  (user: PortEntity) => !hasCompleteOnboardingMetrics(user)
                );
                console.log(`Found ${usersToProcess.length} users without complete onboarding metrics`);
              }

              // Process users in batches to avoid timeouts
              const BATCH_SIZE = parseInt(process.env.ONBOARDING_BATCH_SIZE || '5', 10); // Process 5 users at a time by default
              const TIMEOUT_PER_USER = parseInt(process.env.ONBOARDING_TIMEOUT_PER_USER || '300000', 10); // 5 minutes per user by default
              let processedCount = 0;
              let errorCount = 0;
              const usersWithErrors: string[] = [];

              console.log(`Processing ${usersToProcess.length} users in batches of ${BATCH_SIZE}`);
              console.log(`Timeout settings: ${TIMEOUT_PER_USER/1000}s per user, ${PROCESS_TIMEOUT/1000}s total process`);

              for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
                const batch = usersToProcess.slice(i, i + BATCH_SIZE);
                console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(usersToProcess.length / BATCH_SIZE)} (${batch.length} users)`);

                // Process batch concurrently with timeout
                const batchPromises = batch.map(async (user, batchIndex) => {
                  const userIndex = i + batchIndex;
                  console.log(`Processing developer ${userIndex + 1} of ${usersToProcess.length}: ${user.identifier}`);
                  
                  try {
                    // Ensure user has required properties
                    if (!user.identifier) {
                      console.error(`User missing identifier:`, user);
                      return { success: false, user: user.identifier, error: 'Missing identifier' };
                    }

                    const joinDate = joinRecords.find(
                      (record) => record.user === user.identifier
                    )?.created_at;
                    if (!joinDate) {
                      console.error(`No join date found for ${user.identifier}`);
                      return { success: false, user: user.identifier, error: 'No join date found' };
                    }
                    console.log(`Calculating stats for ${user.identifier} with join date ${joinDate}`);

                    // Convert PortEntity to GitHubUser format
                    const githubUser: GitHubUser = {
                      identifier: user.identifier,
                      title: user.title,
                      properties: user.properties || {},
                      relations: user.relations || undefined,
                    };

                    // Add timeout to individual user processing
                    const timeoutPromise = new Promise<never>((_, reject) => {
                      setTimeout(() => reject(new Error('User processing timeout')), TIMEOUT_PER_USER);
                    });

                    await Promise.race([
                      calculateAndStoreDeveloperStats(
                        GITHUB_ORGS,
                        {
                          appId: GITHUB_APP_ID,
                          privateKey: GITHUB_APP_PRIVATE_KEY,
                          installationId: GITHUB_APP_INSTALLATION_ID,
                        },
                        githubUser,
                        joinDate
                      ),
                      timeoutPromise
                    ]);

                    return { success: true, user: user.identifier };
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`Error processing developer ${user.identifier}: ${errorMessage}`);
                    return { success: false, user: user.identifier, error: errorMessage };
                  }
                });

                // Wait for batch to complete
                const batchResults = await Promise.all(batchPromises);
                
                // Process batch results
                batchResults.forEach(result => {
                  if (result.success) {
                    processedCount++;
                  } else {
                    errorCount++;
                    if (result.user) {
                      usersWithErrors.push(result.user);
                    }
                  }
                });

                console.log(`Batch completed. Progress: ${processedCount + errorCount}/${usersToProcess.length} users processed`);
                
                // Add a small delay between batches to be conservative with rate limits
                if (i + BATCH_SIZE < usersToProcess.length) {
                  console.log('Waiting 10 seconds before next batch...');
                  await new Promise(resolve => setTimeout(resolve, 10000));
                }
              }

              // Print summary
              console.log('\n=== Processing Summary ===');
              console.log(`Total users processed: ${processedCount}`);
              console.log(`Users with errors: ${errorCount}`);
              if (forceProcessing) {
                console.log('Note: All users were processed due to FORCE_ONBOARDING_METRICS=true');
              }

              if (usersWithErrors.length > 0) {
                console.log('\nUsers with errors:');
                usersWithErrors.forEach((userId) => console.log(`- ${userId}`));
              }

              // If all users failed, that's a fatal error
              if (processedCount === 0 && usersToProcess.length > 0) {
                hasFatalError = true;
                throw new FatalError('Failed to process any users for onboarding metrics');
              }
            })(),
            timeoutPromise
          ]);
        } catch (error) {
          if (error instanceof Error && error.message === 'Onboarding metrics process timeout') {
            console.error('Onboarding metrics process timed out after 45 minutes');
            console.error('Consider processing fewer users or increasing the timeout');
            hasFatalError = true;
            throw new FatalError('Onboarding metrics process timeout', error);
          } else if (error instanceof FatalError) {
            hasFatalError = true;
            throw error;
          }
          console.error(
            `Unexpected error in onboarding metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          hasFatalError = true;
          throw new FatalError('Unexpected error in onboarding metrics', error as Error);
        }

        if (hasFatalError) {
          process.exit(1);
        }
      });

    program
      .command('pr-metrics')
      .description('Send PR metrics to Port')
      .action(async () => {
        let hasFatalError = false;

        try {
          console.log('Calculating PR metrics...');
          const githubClient = createGitHubClient({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: GITHUB_APP_INSTALLATION_ID,
          });
          await githubClient.checkRateLimits();

          // Process organizations concurrently
          const orgPromises = GITHUB_ORGS.map(async (orgName) => {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await calculateAndStorePRMetrics(repos, {
                  appId: GITHUB_APP_ID,
                  privateKey: GITHUB_APP_PRIVATE_KEY,
                  installationId: GITHUB_APP_INSTALLATION_ID,
                });
              });
              return { success: true, orgName };
            } catch (error) {
              console.error(
                `Error processing organization ${orgName}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              return { success: false, orgName, error };
            }
          });

          const results = await Promise.all(orgPromises);
          const successful = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          console.log(
            `PR metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`
          );

          if (failed.length > 0) {
            hasFatalError = true;
            throw new FatalError('Failed to process PR metrics for one or more organizations');
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error(
            `Unexpected error in PR metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          hasFatalError = true;
          throw new FatalError('Unexpected error in PR metrics', error as Error);
        }
      });

    program
      .command('workflow-metrics')
      .description('Send GitHub Workflow metrics to Port')
      .action(async () => {
        let hasFatalError = false;

        try {
          console.log('Calculating Workflows metrics...');
          const githubClient = createGitHubClient({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: GITHUB_APP_INSTALLATION_ID,
          });
          await githubClient.checkRateLimits();
          const portClient = await PortClient.getInstance();

          // Process organizations concurrently
          const orgPromises = GITHUB_ORGS.map(async (orgName) => {
            try {
              await calculateWorkflowMetrics(githubClient, portClient, orgName);
              return { success: true, orgName };
            } catch (error) {
              console.error(
                `Error processing organization ${orgName}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              return { success: false, orgName, error };
            }
          });

          const results = await Promise.all(orgPromises);
          const successful = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          console.log(
            `Workflow metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`
          );

          if (failed.length > 0) {
            hasFatalError = true;
            throw new FatalError(
              'Failed to process workflow metrics for one or more organizations'
            );
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error(
            `Unexpected error in workflow metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          hasFatalError = true;
          throw new FatalError('Unexpected error in workflow metrics', error as Error);
        }
      });

    program
      .command('service-metrics')
      .description('Send GitHub Service metrics to Port')
      .action(async () => {
        let hasFatalError = false;

        try {
          console.log('Calculating Service metrics...');
          const githubClient = createGitHubClient({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: GITHUB_APP_INSTALLATION_ID,
          });
          await githubClient.checkRateLimits();

          // Process organizations concurrently
          const orgPromises = GITHUB_ORGS.map(async (orgName) => {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await calculateAndStoreServiceMetrics(repos, {
                  appId: GITHUB_APP_ID,
                  privateKey: GITHUB_APP_PRIVATE_KEY,
                  installationId: GITHUB_APP_INSTALLATION_ID,
                });
              });
              return { success: true, orgName };
            } catch (error) {
              console.error(
                `Error processing organization ${orgName}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              return { success: false, orgName, error };
            }
          });

          const results = await Promise.all(orgPromises);
          const successful = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          console.log(
            `Service metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`
          );

          if (failed.length > 0) {
            hasFatalError = true;
            throw new FatalError('Failed to process service metrics for one or more organizations');
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error(
            `Unexpected error in service metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          hasFatalError = true;
          throw new FatalError('Unexpected error in service metrics', error as Error);
        }
      });

    program
      .command('timeseries-service-metrics')
      .description('Send GitHub Time-Series Service metrics to Port')
      .option('-p, --period-type <type>', 'Time period type (daily, weekly, monthly)', 'daily')
      .option('-d, --days-back <number>', 'Number of days to look back', '90')
      .action(async (options) => {
        let hasFatalError = false;

        try {
          console.log('Calculating Time-Series Service metrics...');
          const githubClient = createGitHubClient({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: GITHUB_APP_INSTALLATION_ID,
          });
          await githubClient.checkRateLimits();

          const periodType = options.periodType as 'daily' | 'weekly' | 'monthly';
          const daysBack = parseInt(options.daysBack, 10);

          console.log(`Processing ${periodType} metrics for the last ${daysBack} days`);

          // Process organizations concurrently
          const orgPromises = GITHUB_ORGS.map(async (orgName) => {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await calculateAndStoreTimeSeriesServiceMetrics(
                  repos,
                  {
                    appId: GITHUB_APP_ID,
                    privateKey: GITHUB_APP_PRIVATE_KEY,
                    installationId: GITHUB_APP_INSTALLATION_ID,
                  },
                  periodType,
                  daysBack
                );
              });
              return { success: true, orgName };
            } catch (error) {
              console.error(
                `Error processing organization ${orgName}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              return { success: false, orgName, error };
            }
          });

          const results = await Promise.all(orgPromises);
          const successful = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          console.log(
            `Time-series service metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`
          );

          if (failed.length > 0) {
            hasFatalError = true;
            throw new FatalError(
              'Failed to process time-series service metrics for one or more organizations'
            );
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error(
            `Unexpected error in time-series service metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          throw new FatalError('Unexpected error in time-series service metrics', error as Error);
        }
      });

    await program.parseAsync();
  } catch (error) {
    console.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Export main function for testing
export { main };

main();
