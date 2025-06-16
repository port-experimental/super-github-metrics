#!/usr/bin/env node

import { Command } from 'commander';

import { getEntities } from './port_client';
import { getMemberAddDates, hasCompleteOnboardingMetrics, getRepositories, calculateAndStoreDeveloperStats } from './onboarding_metrics';
import { checkRateLimits } from './utils';
import { calculateAndStorePRMetrics } from './pr_metrics';
import { getWorkflowMetrics } from './workflow_metrics';

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
    console.log(process.env);
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
      console.log(githubUsers);
      
      const joinRecords = await getMemberAddDates(ENTERPRISE_NAME, AUTH_TOKEN);
      console.log(joinRecords);
      
      const repos = await getRepositories(GITHUB_ORGS, AUTH_TOKEN);
      console.log(`Got ${repos.length} repos`);
      
      // Only go over users without complete onboarding metrics in Port
      const usersWithoutOnboardingMetrics = githubUsers.entities.filter((user: any) => !hasCompleteOnboardingMetrics(user));
      console.log(`Found ${usersWithoutOnboardingMetrics.length} users without complete onboarding metrics`);
      
      // For each user, get the onboarding metrics
      for (const user of usersWithoutOnboardingMetrics) {
        const joinDate = joinRecords.find(record => record.user === user.identifier)?.createdAt;
        if (!joinDate) {
          console.log(`No join date found for ${user.identifier}. Skipping...`);
          continue;
        }
        console.log(`Calculating stats for ${user.identifier} with join date ${joinDate}`);
        await calculateAndStoreDeveloperStats(GITHUB_ORGS, AUTH_TOKEN, user, joinDate);
      }
    });
    
    program
    .command('pr-metrics')
    .description('Send PR metrics to Port')
    .action(async () => {
      console.log('Calculating PR metrics...');
      await checkRateLimits(AUTH_TOKEN);
      const repos = await getRepositories(GITHUB_ORGS, AUTH_TOKEN);
      console.log(`Got ${repos.length} repos`);
      await calculateAndStorePRMetrics(repos, AUTH_TOKEN);
      
    });
    
    program
    .command('workflow-metrics')
    .description('Send GitHub Workflow metrics to Port')
    .action(async () => {
      console.log('Calculating Workflows metrics...');
      await checkRateLimits(AUTH_TOKEN);
      const repos = await getRepositories(GITHUB_ORGS, AUTH_TOKEN);
      await getWorkflowMetrics(repos, AUTH_TOKEN);
    });
    
    await program.parseAsync();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();