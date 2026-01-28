/**
 * Centralized constants and configuration values for the application.
 * This file extracts magic numbers and configuration values into named constants
 * for better maintainability and documentation.
 */

// =============================================================================
// TOKEN AND AUTHENTICATION CONSTANTS
// =============================================================================

/**
 * Buffer time (in milliseconds) before token expiry to trigger refresh.
 * Tokens are refreshed 5 minutes before they expire to prevent stale token usage.
 */
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default expiry time for bearer tokens (in milliseconds).
 * Bearer tokens default to 24-hour expiry when no explicit expiry is provided.
 */
export const BEARER_TOKEN_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Default expiry time for GitHub App installation tokens (in milliseconds).
 * GitHub App tokens typically expire in 1 hour.
 */
export const GITHUB_APP_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Default rate limit for GitHub API requests per hour.
 * This is the standard rate limit for authenticated requests.
 */
export const GITHUB_RATE_LIMIT_PER_HOUR = 5000;

/**
 * Rate limit reset interval (in milliseconds).
 * GitHub rate limits reset every hour.
 */
export const GITHUB_RATE_LIMIT_RESET_MS = 60 * 60 * 1000; // 1 hour (3600000ms)

/**
 * Default wait time (in seconds) for rate limit reset when not specified.
 */
export const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 3600; // 1 hour

// =============================================================================
// RETRY AND BACKOFF CONSTANTS
// =============================================================================

/**
 * Maximum number of retry attempts for failed requests.
 */
export const MAX_REQUEST_RETRIES = 3;

/**
 * Maximum backoff delay (in milliseconds) for exponential retry.
 */
export const MAX_BACKOFF_DELAY_MS = 30000; // 30 seconds

/**
 * Base delay (in milliseconds) for exponential backoff calculation.
 */
export const BASE_BACKOFF_DELAY_MS = 1000; // 1 second

/**
 * Chunk size (in seconds) for rate limit wait periods.
 * Wait is broken into 1-minute chunks to allow for early termination.
 */
export const RATE_LIMIT_WAIT_CHUNK_SECONDS = 60; // 1 minute

/**
 * Interval (in chunks) for logging progress during rate limit wait.
 * Progress is logged every 5 minutes.
 */
export const RATE_LIMIT_LOG_INTERVAL_CHUNKS = 5;

// =============================================================================
// BATCH PROCESSING CONSTANTS
// =============================================================================

/**
 * Maximum number of entities per Port API bulk request.
 * Port API has a limit of 20 entities per bulk upsert request.
 */
export const PORT_BATCH_SIZE = 20;

/**
 * Default batch size for processing users in onboarding metrics.
 */
export const DEFAULT_ONBOARDING_BATCH_SIZE = 3;

/**
 * Delay between batches (in milliseconds) for onboarding metrics.
 */
export const ONBOARDING_BATCH_DELAY_MS = 15000; // 15 seconds

/**
 * Delay between batches (in milliseconds) for PR metrics processing.
 */
export const PR_METRICS_BATCH_DELAY_MS = 1000; // 1 second

/**
 * Delay between API requests (in milliseconds) to be conservative with rate limits.
 */
export const API_REQUEST_DELAY_MS = 100; // 100ms

// =============================================================================
// CONCURRENCY LIMITS
// =============================================================================

/**
 * Concurrency limits for various operations.
 * These control how many operations can run in parallel to avoid overwhelming APIs.
 */
export const CONCURRENCY = {
  /** Number of repositories to process concurrently */
  REPOSITORIES: 5,
  /** Lower limit for time-series due to more intensive processing */
  TIME_SERIES_REPOSITORIES: 3,
  /** Number of PRs to process concurrently within a time period */
  PRS_PER_TIME_PERIOD: 10,
  /** Number of organizations to process concurrently */
  ORGANIZATIONS: 3,
  /** Number of concurrent API calls per PR/item (e.g., PR data, reviews, changes) */
  API_CALLS_PER_ITEM: 3,
} as const;

// =============================================================================
// TIME PERIODS
// =============================================================================

/**
 * Standard time periods (in days) used across GitHub metrics.
 */
export const TIME_PERIODS = {
  ONE_DAY: 1,
  SEVEN_DAYS: 7,
  THIRTY_DAYS: 30,
  SIXTY_DAYS: 60,
  NINETY_DAYS: 90,
} as const;

export type TimePeriod = (typeof TIME_PERIODS)[keyof typeof TIME_PERIODS];

/**
 * Milliseconds per day, used for date calculations.
 */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Milliseconds per hour, used for time calculations.
 */
export const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Seconds per hour, used for rate limit calculations.
 */
export const SECONDS_PER_HOUR = 3600;

// =============================================================================
// PAGINATION CONSTANTS
// =============================================================================

/**
 * Default page size for GitHub API pagination.
 */
export const GITHUB_PAGE_SIZE = 100;

// =============================================================================
// CIRCUIT BREAKER CONSTANTS
// =============================================================================

/**
 * Number of consecutive failures before opening the circuit breaker.
 */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

/**
 * Time (in milliseconds) to wait before attempting to close the circuit.
 */
export const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Number of successful requests needed to close the circuit.
 */
export const CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 2;

// =============================================================================
// CACHE CONSTANTS
// =============================================================================

/**
 * Default cache TTL (in milliseconds).
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum cache size (number of entries).
 */
export const MAX_CACHE_SIZE = 1000;

// =============================================================================
// METRICS VALIDATION CONSTANTS
// =============================================================================

/**
 * Minimum valid value for percentage metrics.
 */
export const PERCENTAGE_MIN = 0;

/**
 * Maximum valid value for percentage metrics.
 */
export const PERCENTAGE_MAX = 100;

/**
 * Default value for metrics when calculation results in NaN or Infinity.
 */
export const INVALID_METRIC_DEFAULT = 0;
