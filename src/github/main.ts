#!/usr/bin/env node

import { Command } from 'commander';
import { registerGithubCommands } from './command';

async function main() {
  try {
    const program = new Command();

    program
      .name('github-sync')
      .description('CLI to pull metrics from GitHub to Port');

    registerGithubCommands(program);

    await program.parseAsync();
  } catch (error) {
    console.error(
      `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
}

// Export main function for testing
export { main };

main();
