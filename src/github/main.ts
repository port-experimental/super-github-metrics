#!/usr/bin/env node

import { Command } from "commander";
import pino from "pino";
import pinoCaller from "pino-caller";
import { registerGithubCommands } from "./command";
import pinoConfig from "../pino.config";

const logger = pinoCaller(pino(pinoConfig));

async function main() {
  try {
    const program = new Command();

    program
      .name("github-sync")
      .description("CLI to pull metrics from GitHub to Port");

    registerGithubCommands(program, logger);

    await program.parseAsync();
  } catch (error) {
    logger.error(
      { err: error },
      `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}

// Export main function for testing
export { main };

main();
