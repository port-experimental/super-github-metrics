/**
 * Circuit Breaker pattern implementation for external API calls.
 * Prevents cascading failures by temporarily stopping requests to failing services.
 */

import type { Logger } from "pino";
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
} from "../constants";

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Circuit is operating normally */
  CLOSED = "CLOSED",
  /** Circuit is blocking requests due to failures */
  OPEN = "OPEN",
  /** Circuit is testing if the service has recovered */
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Configuration options for the circuit breaker
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** Time (in ms) to wait before attempting to close the circuit */
  resetTimeout?: number;
  /** Number of successful requests needed to close the circuit from half-open */
  successThreshold?: number;
  /** Optional logger for circuit breaker events */
  logger?: Logger;
  /** Name for this circuit breaker (used in logs) */
  name?: string;
}

/**
 * Error thrown when the circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN - request blocked`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Circuit Breaker implementation.
 * Wraps async operations and prevents cascading failures.
 *
 * @example
 * const breaker = new CircuitBreaker({ name: 'github-api' });
 *
 * try {
 *   const result = await breaker.execute(() => fetchFromGitHub());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, handle gracefully
 *   }
 * }
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly logger?: Logger;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    this.resetTimeout = options.resetTimeout ?? CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
    this.successThreshold = options.successThreshold ?? CIRCUIT_BREAKER_SUCCESS_THRESHOLD;
    this.logger = options.logger;
    this.name = options.name ?? "default";
  }

  /**
   * Gets the current state of the circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Gets statistics about the circuit breaker
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: Date | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime)
        : null,
    };
  }

  /**
   * Executes an operation through the circuit breaker.
   *
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should attempt to transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Manually resets the circuit breaker to CLOSED state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    this.logger?.info(
      { circuitBreaker: this.name },
      "Circuit breaker manually reset"
    );
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) {
      return true;
    }
    return Date.now() - this.lastFailureTime >= this.resetTimeout;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.logger?.warn(
      {
        circuitBreaker: this.name,
        state: this.state,
        failureCount: this.failureCount,
        error: error instanceof Error ? error.message : String(error),
      },
      "Circuit breaker recorded failure"
    );

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    this.logger?.info(
      {
        circuitBreaker: this.name,
        previousState,
        newState,
        failureCount: this.failureCount,
      },
      `Circuit breaker state transition: ${previousState} -> ${newState}`
    );
  }
}

/**
 * Creates a circuit breaker with default settings for GitHub API calls
 */
export function createGitHubCircuitBreaker(
  logger?: Logger
): CircuitBreaker {
  return new CircuitBreaker({
    name: "github-api",
    failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    resetTimeout: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    successThreshold: CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    logger,
  });
}

/**
 * Creates a circuit breaker with default settings for Port API calls
 */
export function createPortCircuitBreaker(
  logger?: Logger
): CircuitBreaker {
  return new CircuitBreaker({
    name: "port-api",
    failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    resetTimeout: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    successThreshold: CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    logger,
  });
}
