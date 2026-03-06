/**
 * Shared utility functions for GitHub metrics optimization
 */

/**
 * Filters data for a specific time period
 */
export function filterDataForTimePeriod<T extends { created_at: string }>(
  data: T[],
  daysBack: TimePeriod
): T[] {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return data.filter((item) => {
    const itemDate = new Date(item.created_at);
    return itemDate >= cutoffDate;
  });
}

/**
 * Filters commits for a specific time period based on commit.author.date
 */
export function filterCommitsForTimePeriod<
  T extends { commit?: { author?: { date?: string } | null } },
>(data: T[], daysBack: number): T[] {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return data.filter((item) => {
    const dateValue = item.commit?.author?.date;
    if (!dateValue) return false;
    return new Date(dateValue) >= cutoffDate;
  });
}

/**
 * Filters data for a specific time period based on a custom date field
 */
export function filterDataForTimePeriodByField<T>(
  data: T[],
  daysBack: number,
  dateField: keyof T
): T[] {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return data.filter((item) => {
    const dateValue = item[dateField];
    if (typeof dateValue === 'string') {
      return new Date(dateValue) >= cutoffDate;
    }
    return false;
  });
}

/**
 * Common time periods used across GitHub metrics
 */
export const TIME_PERIODS = {
  ONE_DAY: 1,
  SEVEN_DAYS: 7,
  THIRTY_DAYS: 30,
  SIXTY_DAYS: 60,
  NINETY_DAYS: 90,
} as const;

export type TimePeriod = (typeof TIME_PERIODS)[keyof typeof TIME_PERIODS];

// Global concurrency limits for GitHub API calls
export const CONCURRENCY_LIMITS = {
  // Repository processing limits
  REPOSITORIES: 5, // Number of repositories to process concurrently
  TIME_SERIES_REPOSITORIES: 5, // Increased from 3 - now safe with review caching optimization

  // PR processing limits (within each time period)
  PRS_PER_TIME_PERIOD: 10, // Number of PRs to process concurrently within a time period

  // Organization processing limits
  ORGANIZATIONS: 3, // Number of organizations to process concurrently

  // API calls per item limits
  API_CALLS_PER_ITEM: 3, // Number of concurrent API calls per PR/item (e.g., PR data, reviews, changes)
} as const;

/**
 * Gets the maximum time period from an array of time periods
 */
export function getMaxTimePeriod(timePeriods: TimePeriod[]): TimePeriod {
  return Math.max(...timePeriods) as TimePeriod;
}

/**
 * Creates a cutoff date for a given number of days back
 */
export function createCutoffDate(daysBack: number): Date {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
}
