/**
 * Centralized logger module for the application.
 * Provides a singleton logger instance that can be used throughout the codebase.
 * Replaces scattered console.log calls with structured logging.
 */

import pino, { type Logger } from "pino";
import pinoConfig from "./pino.config";

/**
 * Singleton logger instance.
 * This is the default logger used when no specific logger is provided.
 */
let globalLogger: Logger | null = null;

/**
 * Gets the global logger instance, creating it if necessary.
 * @returns The singleton Logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = pino(pinoConfig);
  }
  return globalLogger;
}

/**
 * Creates a child logger with additional context.
 * Useful for adding module or component context to log messages.
 *
 * @param context - Additional context to include in all log messages
 * @returns A child Logger instance with the given context
 *
 * @example
 * const logger = createChildLogger({ module: 'github-client' });
 * logger.info({ repo: 'my-repo' }, 'Processing repository');
 */
export function createChildLogger(context: Record<string, unknown>): Logger {
  return getLogger().child(context);
}

/**
 * Sets the global logger instance.
 * Useful for testing or when a custom logger configuration is needed.
 *
 * @param logger - The logger instance to use globally
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Resets the global logger to null.
 * Primarily used for testing to ensure a fresh logger state.
 */
export function resetGlobalLogger(): void {
  globalLogger = null;
}

// Export the default logger for convenience
export default getLogger();
