#!/usr/bin/env node

import { Command } from 'commander';
import {
  type AuditLogEntry,
  createGitHubClient,
  type GitHubClient,
  type Repository,
} from '../clients/github';
import { getEntities } from '../clients/port';
import type { GitHubUser } from '../types/github';
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
  const PORT_CLIENT_ID = process.env.PORT_CLIENT_ID;
  const PORT_CLIENT_SECRET = process.env.PORT_CLIENT_SECRET;
  const AUTH_TOKEN = process.env.X_GITHUB_TOKEN;
  const ENTERPRISE_NAME = process.env.X_GITHUB_ENTERPRISE;
  const GITHUB_ORGS = process.env.X_GITHUB_ORGS?.split(',') || [];

  if (
    !PORT_CLIENT_ID ||
    !PORT_CLIENT_SECRET ||
    !AUTH_TOKEN ||
    !ENTERPRISE_NAME ||
    GITHUB_ORGS.length === 0
  ) {
    console.log(
      'Please provide env vars PORT_CLIENT_ID, PORT_CLIENT_SECRET, X_GITHUB_TOKEN, X_GITHUB_ENTERPRISE, and X_GITHUB_ORGS'
    );
    process.exit(0);
  }

  try {
    const program = new Command();

    program.name('github-sync').description('CLI to pull metrics from GitHub to Port');

    program
      .command('onboarding-metrics')
      .description('Send onboarding metrics to Port')
      .action(async () => {
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
          }
        }

        // Only go over users without complete onboarding metrics in Port
        const usersWithoutOnboardingMetrics = githubUsers.entities.filter(
          (user: PortEntity) => !hasCompleteOnboardingMetrics(user)
        );
        console.log(
          `Found ${usersWithoutOnboardingMetrics.length} users without complete onboarding metrics`
        );

        // For each user, get the onboarding metrics
        let processedCount = 0;
        let errorCount = 0;
        const usersWithErrors: string[] = [];

        for (const [index, user] of usersWithoutOnboardingMetrics.entries()) {
          console.log(
            `Processing developer ${index + 1} of ${usersWithoutOnboardingMetrics.length}`
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
            if (error instanceof TypeError) {
              console.error(`TypeError processing developer ${user.identifier}:`, user);
            } else {
              console.error(`Error processing developer ${user.identifier}:`, error);
            }
          }
        }

        // Print summary
        console.log('\n=== Processing Summary ===');
        console.log(`Total users processed: ${processedCount}`);
        console.log(`Users with errors: ${errorCount}`);

        if (usersWithErrors.length > 0) {
          console.log('\nUsers with errors:');
          usersWithErrors.forEach((userId) => console.log(`- ${userId}`));
        }
      });

    program
      .command('pr-metrics')
      .description('Send PR metrics to Port')
      .action(async () => {
        try {
          console.log('Calculating PR metrics...');
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            await processOrganizationRepositories(githubClient, orgName, async (repos) => {
              await calculateAndStorePRMetrics(repos, AUTH_TOKEN);
            });
          }
        } catch (error) {
          console.error('Error:', error);
        }
      });

    program
      .command('workflow-metrics')
      .description('Send GitHub Workflow metrics to Port')
      .action(async () => {
        try {
          console.log('Calculating Workflows metrics...');
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            await processOrganizationRepositories(githubClient, orgName, async (repos) => {
              await getWorkflowMetrics(repos, AUTH_TOKEN);
            });
          }
        } catch (error) {
          console.error('Error:', error);
        }
      });

    program
      .command('service-metrics')
      .description('Send GitHub Service metrics to Port')
      .action(async () => {
        try {
          console.log('Calculating Service metrics...');
          const githubClient = createGitHubClient(AUTH_TOKEN);
          await githubClient.checkRateLimits();

          for (const orgName of GITHUB_ORGS) {
            await processOrganizationRepositories(githubClient, orgName, async (repos) => {
              await calculateAndStoreServiceMetrics(
                repos.map((repo) => ({ ...repo, id: repo.id.toString() })),
                AUTH_TOKEN
              );
            });
          }
        } catch (error) {
          console.error('Error:', error);
        }
      });

    await program.parseAsync();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
