#!/usr/bin/env node

import { Command } from 'commander';

import { getEntities, upsertProps } from './port_client';
import { getMemberAddDates, hasCompleteOnboardingMetrics, calculateAndStoreDeveloperStats } from './onboarding_metrics';
import { checkRateLimits } from './utils';
import { calculateAndStorePRMetrics } from './pr_metrics';
import { getWorkflowMetrics } from './workflow_metrics';
import { Octokit } from '@octokit/rest';
// import fs from 'fs';

if (process.env.GITHUB_ACTIONS !== 'true') {
  require('dotenv').config();
}

async function main() {
  const PORT_CLIENT_ID = process.env.PORT_CLIENT_ID;
  const PORT_CLIENT_SECRET = process.env.PORT_CLIENT_SECRET;
  const AUTH_TOKEN = process.env.X_GITHUB_TOKEN;
  const ENTERPRISE_NAME = process.env.X_GITHUB_ENTERPRISE;
  const GITHUB_ORGS = process.env.X_GITHUB_ORGS?.split(',') || [];
  
  if (!PORT_CLIENT_ID || !PORT_CLIENT_SECRET || !AUTH_TOKEN || !ENTERPRISE_NAME || GITHUB_ORGS.length === 0) {
    console.log('Please provide env vars PORT_CLIENT_ID, PORT_CLIENT_SECRET, X_GITHUB_TOKEN, X_GITHUB_ENTERPRISE, and X_GITHUB_ORGS');
    process.exit(0);
  }
  
  try {
    const program = new Command();
    
    program
    .name('github-sync')
    .description('CLI to pull metrics from GitHub to Port');
    
    program
    .command('onboarding-metrics')
    .description('Send onboarding metrics to Port')
    .action(async () => {
      console.log('Calculating onboarding metrics...');
      await checkRateLimits(AUTH_TOKEN);
      const githubUsers = await getEntities('githubUser');
      console.log(`Found ${githubUsers.entities.length} github users in Port`);
      let joinRecords: any[] = [];
      // Try fetch join dates from the audit log
      try {
        joinRecords = await getMemberAddDates(ENTERPRISE_NAME, AUTH_TOKEN);
        console.log(`Found ${joinRecords.length} join records`);
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 403) {
          console.log('Looks like insufficient permissions to query audit log. Skipping join records...');
        }
      }
      
      // Only go over users without complete onboarding metrics in Port
      const usersWithoutOnboardingMetrics = githubUsers.entities.filter((user: any) => !hasCompleteOnboardingMetrics(user));
      console.log(`Found ${usersWithoutOnboardingMetrics.length} users without complete onboarding metrics`);
      
      // For each user, get the onboarding metrics
      for (const [index, user] of usersWithoutOnboardingMetrics.entries()) {
        console.log(`Processing developer ${index + 1} of ${usersWithoutOnboardingMetrics.length}`);
        try {
          const joinDate = user.properties.join_date ? user.properties.join_date : joinRecords.find(record => record.user === user.identifier)?.createdAt;
          if (joinDate === null || joinDate === undefined) {
            console.log(`No join date found for ${user.identifier}. Skipping...`);
            continue;
          }
          console.log(`Calculating stats for ${user.identifier} with join date ${joinDate}`);
          await calculateAndStoreDeveloperStats(GITHUB_ORGS, AUTH_TOKEN, user, joinDate);
        } catch (error) {
          if (error instanceof TypeError) {
            console.error(`TypeError processing developer ${user.identifier}:`, user);
          } else {
            console.error(`Error processing developer ${user.identifier}:`, error);
          }
        }
      }
    });
    
    program
    .command('pr-metrics')
    .description('Send PR metrics to Port')
    .action(async () => {
      try {
        console.log('Calculating PR metrics...');
        await checkRateLimits(AUTH_TOKEN);
        const octokit = new Octokit({ auth: AUTH_TOKEN });
        for (const orgName of GITHUB_ORGS) {
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const { data: orgRepos } = await octokit.repos.listForOrg({
              org: orgName,
              sort: 'pushed', // default = direction: desc
              per_page: 100,
              page: page
            });
            
            // If we got less than 100 repos, we've reached the end
            console.log(`Fetched ${orgRepos.length} repos in this page, processing`);
            await calculateAndStorePRMetrics(orgRepos, AUTH_TOKEN);
            hasMore = orgRepos.length === 100;
            page++;
          }
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
        await checkRateLimits(AUTH_TOKEN);
        const octokit = new Octokit({ auth: AUTH_TOKEN });
        for (const orgName of GITHUB_ORGS) {
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const { data: orgRepos } = await octokit.repos.listForOrg({
              org: orgName,
              sort: 'pushed', // default = direction: desc
              per_page: 100,
              page: page
            });
            
            // If we got less than 100 repos, we've reached the end
            console.log(`Fetched ${orgRepos.length} repos in this page, processing`);
            await getWorkflowMetrics(orgRepos, AUTH_TOKEN);
            hasMore = orgRepos.length === 100;
            page++;
          }
        }

      } catch (error) {
        console.error('Error:', error);
      }
    });

    // program
    // .command('write-join-dates')
    // .description('Write join dates to Port')
    // .action(async () => {
    //   console.log('Writing join dates to Port...');
    //   const githubUsers = await getEntities('githubUser');
    //   console.log(`Found ${githubUsers.entities.length} github users in Port`);
    //   const rawData = JSON.parse(fs.readFileSync('../filtered_out.json', 'utf8'));

    //   for (const user of githubUsers.entities) {
    //     const userRecord = rawData.find((record: any) => record.user === user.identifier);
    //     if (userRecord) {
    //       console.log(`Found join date for ${user.identifier}: ${userRecord.created_at}`);
    //       await upsertProps('githubUser', user.identifier, { join_date: new Date(userRecord.created_at).toISOString() });
    //     }
    //   }
    // });
    await program.parseAsync();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();