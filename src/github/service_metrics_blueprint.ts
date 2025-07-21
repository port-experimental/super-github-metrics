export const SERVICE_METRICS_BLUEPRINT = {
  identifier: 'serviceMetrics',
  description: 'Time-series metrics for services to enable dashboard visualizations',
  title: 'Service Metrics',
  icon: 'Chart',
  schema: {
    properties: {
      // Time period identifier (e.g., "20240115" for daily, "202403" for weekly, "202401" for monthly)
      period: {
        type: 'string',
        title: 'Time Period',
        description: 'The time period this metric represents (YYYYMMDD for daily, YYYYWW for weekly, YYYYMM for monthly)',
      },
      period_type: {
        type: 'string',
        title: 'Period Type',
        description: 'The type of time period (daily, weekly, monthly)',
        enum: ['daily', 'weekly', 'monthly'],
      },
      // Core metrics
      total_prs: {
        type: 'number',
        title: 'Total Pull Requests',
        description: 'Total number of pull requests in this period',
      },
      total_merged_prs: {
        type: 'number',
        title: 'Total Merged PRs',
        description: 'Total number of merged pull requests in this period',
      },
      number_of_prs_reviewed: {
        type: 'number',
        title: 'PRs Reviewed',
        description: 'Number of pull requests that received at least one review',
      },
      number_of_prs_merged_without_review: {
        type: 'number',
        title: 'PRs Merged Without Review',
        description: 'Number of pull requests merged without any reviews',
      },
      percentage_of_prs_reviewed: {
        type: 'number',
        title: 'PR Review Percentage',
        description: 'Percentage of pull requests that received at least one review',
      },
      percentage_of_prs_merged_without_review: {
        type: 'number',
        title: 'PR Merged Without Review Percentage',
        description: 'Percentage of pull requests merged without any reviews',
      },
      average_time_to_first_review: {
        type: 'number',
        title: 'Average Time to First Review (Days)',
        description: 'Average time in days from PR creation to first review',
      },
      pr_success_rate: {
        type: 'number',
        title: 'PR Success Rate (%)',
        description: 'Percentage of pull requests that were successfully merged',
      },
      contribution_standard_deviation: {
        type: 'number',
        title: 'Contribution Standard Deviation',
        description: 'Standard deviation of contribution counts across contributors',
      },
      // Metadata
      calculated_at: {
        type: 'string',
        title: 'Calculated At',
        description: 'Timestamp when these metrics were calculated',
        format: 'date-time',
      },
      data_source: {
        type: 'string',
        title: 'Data Source',
        description: 'Source of the metrics data',
        default: 'github',
      },
    },
    required: ['period', 'period_type', 'total_prs', 'total_merged_prs'],
  },
  relations: {
    service: {
      title: 'Service',
      target: 'service',
      required: true,
      many: false,
    },
  },
};

export interface ServiceMetricsEntity {
  identifier: string;
  title: string;
  properties: {
    period: string;
    period_type: 'daily' | 'weekly' | 'monthly';
    total_prs: number;
    total_merged_prs: number;
    number_of_prs_reviewed: number;
    number_of_prs_merged_without_review: number;
    percentage_of_prs_reviewed: number;
    percentage_of_prs_merged_without_review: number;
    average_time_to_first_review: number;
    pr_success_rate: number;
    contribution_standard_deviation: number;
    calculated_at: string;
    data_source: string;
  };
  relations: {
    service: string; // Service entity identifier
  };
  [key: string]: unknown; // Index signature to match PortEntity interface
} 