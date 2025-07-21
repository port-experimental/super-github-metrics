#!/usr/bin/env node

import { Command } from 'commander';
import { createGitHubClient, type GitHubClient } from '../clients/github';
import { getEntities } from '../clients/port';
import type { GitHubUser, AuditLogEntry, Repository } from '../types/github';
import type { PortEntity } from '../types/port';
import {
  calculateAndStoreDeveloperStats,
  hasCompleteOnboardingMetrics,
} from './onboarding_metrics';
import { calculateAndStorePRMetrics } from './pr_metrics';
import { calculateAndStoreServiceMetrics } from './service_metrics';
import { getWorkflowMetrics } from './workflow_metrics';

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
    const AUTH_TOKEN = process.env.X_GITHUB_TOKEN;
    const ENTERPRISE_NAME = process.env.X_GITHUB_ENTERPRISE;
    const GITHUB_ORGS = process.env.X_GITHUB_ORGS?.split(',');

    if (!AUTH_TOKEN) {
      throw new FatalError('X_GITHUB_TOKEN environment variable is required');
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

        try {
          console.log('Calculating onboarding metrics...');
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();
          const githubUsers = await getEntities('githubUser');
          console.log(`Found ${githubUsers.entities.length} github users in Port`);

          let joinRecords: AuditLogEntry[] = [];
          // Try fetch join dates from the audit log
          try {
            joinRecords = await githubClient.getMemberAddDates(ENTERPRISE_NAME);
            console.log(`Found ${joinRecords.length} join records`);
          } catch (error) {
            if (error instanceof Error && 'status' in error && error.status === 403) {
              console.log(
                'Looks like insufficient permissions to query audit log. Skipping join records...'
              );
            } else {
              console.warn('Failed to fetch join records, continuing without them:', error);
            }
          }

          // Check if we should force processing all users regardless of existing metrics
          const forceProcessing = process.env.FORCE_ONBOARDING_METRICS === 'true';
          
          let usersToProcess: PortEntity[];
          if (forceProcessing) {
            console.log('FORCE_ONBOARDING_METRICS is enabled - processing all users regardless of existing metrics');
            usersToProcess = githubUsers.entities;
          } else {
            // Only go over users without complete onboarding metrics in Port
            usersToProcess = githubUsers.entities.filter(
              (user: PortEntity) => !hasCompleteOnboardingMetrics(user)
            );
            console.log(
              `Found ${usersToProcess.length} users without complete onboarding metrics`
            );
          }

          // For each user, get the onboarding metrics
          let processedCount = 0;
          let errorCount = 0;
          const usersWithErrors: string[] = [];

          for (const [index, user] of usersToProcess.entries()) {
            console.log(
              `Processing developer ${index + 1} of ${usersToProcess.length}`
            );
            try {
              // Ensure user has required properties
              if (!user.identifier) {
                console.error(`User missing identifier:`, user);
                errorCount++;
                continue;
              }

              const joinDate =
                (user.properties?.join_date
                  ? (user.properties.join_date as string)
                  : joinRecords.find((record) => record.user === user.identifier)?.created_at) ||
                new Date().toISOString();
              console.log(`Calculating stats for ${user.identifier} with join date ${joinDate}`);

              // Convert PortEntity to GitHubUser format
              const githubUser: GitHubUser = {
                identifier: user.identifier,
                title: user.title,
                properties: user.properties || {},
                relations: user.relations || undefined,
              };

              await calculateAndStoreDeveloperStats(GITHUB_ORGS, AUTH_TOKEN, githubUser, joinDate);
              processedCount++;
            } catch (error) {
              errorCount++;
              if (user.identifier) {
                usersWithErrors.push(user.identifier);
              }
              console.error(`Error processing developer ${user.identifier}:`, error);
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
        } catch (error) {
          if (error instanceof FatalError) {
            hasFatalError = true;
            throw error;
          }
          console.error('Unexpected error in onboarding metrics:', error);
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
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await calculateAndStorePRMetrics(repos, AUTH_TOKEN);
              });
            } catch (error) {
              console.error(`Error processing organization ${orgName}:`, error);
              hasFatalError = true;
            }
          }

          if (hasFatalError) {
            throw new FatalError('Failed to process PR metrics for one or more organizations');
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error('Unexpected error in PR metrics:', error);
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
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await getWorkflowMetrics(repos, AUTH_TOKEN);
              });
            } catch (error) {
              console.error(`Error processing organization ${orgName}:`, error);
              hasFatalError = true;
            }
          }

          if (hasFatalError) {
            throw new FatalError(
              'Failed to process workflow metrics for one or more organizations'
            );
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error('Unexpected error in workflow metrics:', error);
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
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            try {
              await processOrganizationRepositories(githubClient, orgName, async (repos) => {
                await calculateAndStoreServiceMetrics(repos, AUTH_TOKEN);
              });
            } catch (error) {
              console.error(`Error processing organization ${orgName}:`, error);
              hasFatalError = true;
            }
          }

          if (hasFatalError) {
            throw new FatalError('Failed to process service metrics for one or more organizations');
          }
        } catch (error) {
          if (error instanceof FatalError) {
            throw error;
          }
          console.error('Unexpected error in service metrics:', error);
          throw new FatalError('Unexpected error in service metrics', error as Error);
        }
      });

    await program.parseAsync();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Export main function for testing
export { main };

main();
