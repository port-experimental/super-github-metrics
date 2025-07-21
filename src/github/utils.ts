/**
 * Shared utility functions for GitHub metrics optimization
 */

/**
 * Filters data for a specific time period based on created_at date
 */
export function filterDataForTimePeriod<T extends { created_at?: string }>(
  data: T[],
  daysBack: number
): T[] {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return data.filter((item) => {
    if (!item.created_at) return false;
    return new Date(item.created_at) >= cutoffDate;
  });
}

/**
 * Filters commits for a specific time period based on commit.author.date
 */
export function filterCommitsForTimePeriod<T extends { commit?: { author?: { date?: string } } }>(
  data: T[],
  daysBack: number
): T[] {
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

/**
 * Gets the maximum time period from an array of time periods
 */
export function getMaxTimePeriod(periods: TimePeriod[]): TimePeriod {
  return Math.max(...periods) as TimePeriod;
}

/**
 * Creates a cutoff date for a given number of days back
 */
export function createCutoffDate(daysBack: number): Date {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
}
