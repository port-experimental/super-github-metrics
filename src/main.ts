import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import { registerCoderCommands } from './coder.ts/command';
import { registerGithubCommands } from './github/command';
import pinoConfig from './pino.config';

dotenv.config();

const logger = pino(pinoConfig);

async function main() {
  try {
    const program = new Command();

    program.name('integration').description('CLI to run integration commands');

    const coderCommand = new Command('coder').description('CLI to interact with coder');
    registerCoderCommands(coderCommand, logger);
    program.addCommand(coderCommand);

    const githubCommand = new Command('github').description(
      'CLI to pull metrics from GitHub to Port'
    );
    registerGithubCommands(githubCommand, logger);
    program.addCommand(githubCommand);

    await program.parseAsync();
  } catch (error) {
    logger.error({ err: error }, 'Error');
  }
}

main();
