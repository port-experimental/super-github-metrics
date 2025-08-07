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
              console.log('Step 1: Creating GitHub client...');
              const githubClient = createGitHubClient({
                appId: GITHUB_APP_ID,
                privateKey: GITHUB_APP_PRIVATE_KEY,
                installationId: GITHUB_APP_INSTALLATION_ID,
              });
              
              console.log('Step 2: Checking rate limits...');
              await githubClient.checkRateLimits();
              
              console.log('Step 3: Fetching GitHub users from Port...');
              
              // Add timeout for Port API call (5 minutes)
              const portApiTimeout = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Port API timeout')), 5 * 60 * 1000);
              });
              
              const githubUsers = await Promise.race([
                getEntities('githubUser'),
                portApiTimeout
              ]);
              
              console.log(`Found ${githubUsers.entities.length} github users in Port`);

              let joinRecords: AuditLogEntry[] = [];
              // Try fetch join dates from the audit log for each organization concurrently
              try {
                console.log('Step 4: Fetching member join dates from organization audit logs...');
                console.log(`Organizations to process: ${GITHUB_ORGS.join(', ')}`);
                
                const auditLogPromises = GITHUB_ORGS.map(async (orgName) => {
                  console.log(`Fetching audit logs for organization: ${orgName}`);
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

                console.log('Waiting for all audit log requests to complete...');
                
                // Add timeout for audit log fetching (10 minutes)
                const auditLogTimeout = new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error('Audit log fetching timeout')), 10 * 60 * 1000);
                });
                
                const auditLogResults = await Promise.race([
                  Promise.all(auditLogPromises),
                  auditLogTimeout
                ]);
                
                joinRecords = auditLogResults.flat();
                console.log(`Total join records found: ${joinRecords.length}`);
              } catch (error) {
                if (error instanceof Error && error.message === 'Audit log fetching timeout') {
                  console.error('Audit log fetching timed out after 10 minutes');
                  console.error('Continuing without audit log data...');
                } else {
                  console.warn('Failed to fetch join records, continuing without them:', error);
                }
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
                console.log('Step 5: Filtering users without complete onboarding metrics...');
                usersToProcess = githubUsers.entities.filter(
                  (user: PortEntity) => !hasCompleteOnboardingMetrics(user)
                );
                console.log(`Found ${usersToProcess.length} users without complete onboarding metrics`);
              }

              // Process users in batches to avoid timeouts
              const BATCH_SIZE = parseInt(process.env.ONBOARDING_BATCH_SIZE || '3', 10); // Process 3 users at a time by default (reduced from 5)
              const TIMEOUT_PER_USER = parseInt(process.env.ONBOARDING_TIMEOUT_PER_USER || '300000', 10); // 5 minutes per user by default
              let processedCount = 0;
              let errorCount = 0;
              const usersWithErrors: string[] = [];

              console.log(`Processing ${usersToProcess.length} users in batches of ${BATCH_SIZE}`);
              console.log(`Timeout settings: ${TIMEOUT_PER_USER/1000}s per user, ${PROCESS_TIMEOUT/1000}s total process`);

              // Add a timeout for the entire user processing section
              const userProcessingTimeout = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('User processing section timeout')), PROCESS_TIMEOUT - 60000); // 1 minute less than total timeout
              });

              await Promise.race([
                (async () => {
                  for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
                    const batch = usersToProcess.slice(i, i + BATCH_SIZE);
                    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(usersToProcess.length / BATCH_SIZE);
                    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} users) - ${Math.round((i / usersToProcess.length) * 100)}% complete`);

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

                        console.log(`Successfully processed ${user.identifier}`);
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

                    console.log(`Batch ${batchNumber}/${totalBatches} completed. Progress: ${processedCount + errorCount}/${usersToProcess.length} users processed (${Math.round(((processedCount + errorCount) / usersToProcess.length) * 100)}% complete)`);
                    
                    // Add a small delay between batches to be conservative with rate limits
                    if (i + BATCH_SIZE < usersToProcess.length) {
                      console.log('Waiting 15 seconds before next batch...');
                      await new Promise(resolve => setTimeout(resolve, 15000)); // Increased from 10 to 15 seconds
                    }
                  }
                })(),
                userProcessingTimeout
              ]);

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
          } else if (error instanceof Error && error.message === 'User processing section timeout') {
            console.error('User processing section timed out');
            console.error('Consider reducing batch size or increasing timeout');
            hasFatalError = true;
            throw new FatalError('User processing section timeout', error);
          } else if (error instanceof Error && error.message === 'Audit log fetching timeout') {
            console.error('Audit log fetching timed out');
            console.error('Consider reducing the number of organizations or checking permissions');
            hasFatalError = true;
            throw new FatalError('Audit log fetching timeout', error);
          } else if (error instanceof Error && error.message === 'Port API timeout') {
            console.error('Port API call timed out');
            console.error('Check your Port API credentials and network connectivity');
            hasFatalError = true;
            throw new FatalError('Port API timeout', error);
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

    program
      .command('list-user-additions')
      .description('List all user addition events from organization audit logs')
      .action(async () => {
        let hasFatalError = false;

        try {
          console.log('Fetching user addition events from organization audit logs...');
          const githubClient = createGitHubClient({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            installationId: GITHUB_APP_INSTALLATION_ID,
          });
          await githubClient.checkRateLimits();

          console.log(`Organizations to query: ${GITHUB_ORGS.join(', ')}`);
          console.log('='.repeat(80));

          let totalEvents = 0;
          const allEvents: AuditLogEntry[] = [];

          for (const orgName of GITHUB_ORGS) {
            try {
              console.log(`\n📋 Fetching audit logs for organization: ${orgName}`);
              const orgEvents = await githubClient.getMemberAddDates(orgName);
              
              console.log(`Found ${orgEvents.length} user addition events in ${orgName}`);
              
              if (orgEvents.length > 0) {
                console.log(`\n👥 User addition events for ${orgName}:`);
                console.log('-'.repeat(60));
                
                orgEvents.forEach((event, index) => {
                  console.log(`${index + 1}. User: ${event.user}`);
                  console.log(`   User ID: ${event.user_id}`);
                  console.log(`   Added on: ${event.created_at}`);
                  console.log(`   Organization: ${event.org}`);
                  console.log('');
                });
              } else {
                console.log(`   No user addition events found in ${orgName}`);
              }

              allEvents.push(...orgEvents);
              totalEvents += orgEvents.length;

            } catch (error) {
              if (error instanceof Error && 'status' in error && error.status === 403) {
                console.log(`❌ Insufficient permissions to query audit log for ${orgName}`);
                console.log('   Make sure the GitHub App has "Administration" read permissions');
              } else {
                console.error(`❌ Error fetching audit logs for ${orgName}:`, error);
              }
            }
          }

          console.log('\n' + '='.repeat(80));
          console.log('📊 SUMMARY');
          console.log('='.repeat(80));
          console.log(`Total organizations queried: ${GITHUB_ORGS.length}`);
          console.log(`Total user addition events found: ${totalEvents}`);
          
          if (allEvents.length > 0) {
            const uniqueUsers = new Set(allEvents.map(event => event.user));
            console.log(`Unique users found: ${uniqueUsers.size}`);
            
            console.log('\n📅 Events by date:');
            const eventsByDate = allEvents.reduce((acc, event) => {
              const date = event.created_at.split('T')[0]; // Get just the date part
              acc[date] = (acc[date] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            Object.entries(eventsByDate)
              .sort(([a], [b]) => a.localeCompare(b))
              .forEach(([date, count]) => {
                console.log(`   ${date}: ${count} addition(s)`);
              });

            console.log('\n👤 All unique users:');
            Array.from(uniqueUsers).sort().forEach((user, index) => {
              console.log(`   ${index + 1}. ${user}`);
            });
          }

        } catch (error) {
          if (error instanceof FatalError) {
            hasFatalError = true;
            throw error;
          }
          console.error(
            `Unexpected error listing user additions: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          hasFatalError = true;
          throw new FatalError('Unexpected error listing user additions', error as Error);
        }

        if (hasFatalError) {
          process.exit(1);
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
