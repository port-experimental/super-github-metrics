import { Octokit } from '@octokit/rest';
import _ from 'lodash';
import { upsertProps } from './port_client';

interface ServiceMetrics {
    repoId: string;
    repoName: string;
    repoOrganization: string;
    numberOfPRsReviewed: number;
    numberOfPRsMergedWithoutReview: number;
    percentageOfPRsReviewed: number;
    percentageOfPRsMergedWithoutReview: number;
    averageTimeToFirstReview: number;
    totalPRs: number;
    totalMergedPRs: number;
}

interface PRReviewData {
    totalPRs: number;
    totalMergedPRs: number;
    numberOfPRsReviewed: number;
    numberOfPRsMergedWithoutReview: number;
    totalTimeToFirstReview: number;
    prsWithReviewTime: number;
}

interface Repository {
    id: string;
    name: string;
    owner: {
        login: string;
    };
}

/**
 * Makes a GitHub API request with exponential backoff retry logic
 */
async function makeRequestWithRetry<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = 3
): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error: any) {
            lastError = error;

            // Check if it's a rate limit or 403 error
            if (error.status === 403 || error.status === 429) {
                const retryAfter = error.response?.headers?.['retry-after'] || Math.pow(2, attempt);
                const waitTime = parseInt(retryAfter) * 1000;

                console.log(`Rate limited (${error.status}). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries + 1}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // For other errors, throw immediately
            throw error;
        }
    }
    
    throw lastError;
}

/**
 * Fetches all PRs for a repository within the last 90 days
 */
async function fetchRepositoryPRs(
    octokit: Octokit, 
    owner: string, 
    repoName: string
): Promise<any[]> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const allPRs: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const { data: prs } = await makeRequestWithRetry(() => 
            octokit.rest.pulls.list({
                owner,
                repo: repoName,
                per_page: 100,
                state: 'closed',
                sort: 'created',
                direction: 'desc',
                page: page
            })
        );

        // Filter PRs created in last 90 days
        const recentPRs = prs.filter(pr => new Date(pr.created_at) > ninetyDaysAgo);
        allPRs.push(...recentPRs);

        // If we got less than 100 PRs, we've reached the end
        hasMore = recentPRs.length === 100;
        page++;
    }

    return allPRs;
}

/**
 * Analyzes a single PR to extract review metrics
 */
async function analyzePR(
    octokit: Octokit,
    owner: string,
    repoName: string,
    pr: any
): Promise<{
    isReviewed: boolean;
    isMerged: boolean;
    isMergedWithoutReview: boolean;
    timeToFirstReview?: number;
}> {
    const isMerged = !!pr.merged_at;
    
    // Get reviews for this PR
    const { data: reviews } = await makeRequestWithRetry(() =>
        octokit.rest.pulls.listReviews({
            owner,
            repo: repoName,
            pull_number: pr.number,
        })
    );

    const isReviewed = reviews.length > 0;
    const isMergedWithoutReview = isMerged && !isReviewed;
    
    let timeToFirstReview: number | undefined;
    if (isReviewed && reviews[0].submitted_at && pr.created_at) {
        timeToFirstReview = (new Date(reviews[0].submitted_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60);
    }

    return {
        isReviewed,
        isMerged,
        isMergedWithoutReview,
        timeToFirstReview
    };
}

/**
 * Calculates review metrics for all PRs in a repository
 */
async function calculateRepositoryReviewMetrics(
    octokit: Octokit,
    owner: string,
    repoName: string,
    prs: any[]
): Promise<PRReviewData> {
    const metrics: PRReviewData = {
        totalPRs: 0,
        totalMergedPRs: 0,
        numberOfPRsReviewed: 0,
        numberOfPRsMergedWithoutReview: 0,
        totalTimeToFirstReview: 0,
        prsWithReviewTime: 0
    };

    for (const pr of prs) {
        metrics.totalPRs++;
        
        const prAnalysis = await analyzePR(octokit, owner, repoName, pr);
        
        if (prAnalysis.isMerged) {
            metrics.totalMergedPRs++;
        }
        
        if (prAnalysis.isReviewed) {
            metrics.numberOfPRsReviewed++;
            
            if (prAnalysis.timeToFirstReview !== undefined) {
                metrics.totalTimeToFirstReview += prAnalysis.timeToFirstReview;
                metrics.prsWithReviewTime++;
            }
        } else if (prAnalysis.isMergedWithoutReview) {
            metrics.numberOfPRsMergedWithoutReview++;
        }
    }

    return metrics;
}

/**
 * Calculates final percentages and averages from raw metrics
 */
function calculateFinalMetrics(reviewData: PRReviewData): {
    percentageOfPRsReviewed: number;
    percentageOfPRsMergedWithoutReview: number;
    averageTimeToFirstReview: number;
} {
    const percentageOfPRsReviewed = reviewData.totalPRs > 0 
        ? (reviewData.numberOfPRsReviewed / reviewData.totalPRs) * 100 
        : 0;
    
    const percentageOfPRsMergedWithoutReview = reviewData.totalMergedPRs > 0 
        ? (reviewData.numberOfPRsMergedWithoutReview / reviewData.totalMergedPRs) * 100 
        : 0;
    
    const averageTimeToFirstReview = reviewData.prsWithReviewTime > 0 
        ? reviewData.totalTimeToFirstReview / reviewData.prsWithReviewTime 
        : 0;

    return {
        percentageOfPRsReviewed,
        percentageOfPRsMergedWithoutReview,
        averageTimeToFirstReview
    };
}

/**
 * Creates the final service metrics record
 */
function createServiceMetricsRecord(
    repo: Repository,
    reviewData: PRReviewData,
    finalMetrics: ReturnType<typeof calculateFinalMetrics>
): ServiceMetrics {
    return {
        repoId: repo.id,
        repoName: repo.name,
        repoOrganization: repo.owner.login,
        numberOfPRsReviewed: reviewData.numberOfPRsReviewed,
        numberOfPRsMergedWithoutReview: reviewData.numberOfPRsMergedWithoutReview,
        percentageOfPRsReviewed: finalMetrics.percentageOfPRsReviewed,
        percentageOfPRsMergedWithoutReview: finalMetrics.percentageOfPRsMergedWithoutReview,
        averageTimeToFirstReview: finalMetrics.averageTimeToFirstReview,
        totalPRs: reviewData.totalPRs,
        totalMergedPRs: reviewData.totalMergedPRs,
    };
}

/**
 * Stores service metrics to Port
 */
async function storeServiceMetrics(record: ServiceMetrics): Promise<void> {
    const props: Record<string, any> = _.chain(record)
        .pick([
            'repoOrganization',
            'numberOfPRsReviewed',
            'numberOfPRsMergedWithoutReview', 
            'percentageOfPRsReviewed',
            'percentageOfPRsMergedWithoutReview',
            'averageTimeToFirstReview',
            'totalPRs',
            'totalMergedPRs'
        ])
        .mapKeys((_value, key) => _.snakeCase(key))
        .value();

    await upsertProps('githubRepository', record.repoName, props);
}

/**
 * Logs service metrics summary
 */
function logServiceMetricsSummary(record: ServiceMetrics): void {
    console.log(`Updated service metrics for repo ${record.repoName} (${record.repoOrganization}):`, {
        totalPRs: record.totalPRs,
        totalMergedPRs: record.totalMergedPRs,
        reviewed: record.numberOfPRsReviewed,
        mergedWithoutReview: record.numberOfPRsMergedWithoutReview,
        reviewPercentage: record.percentageOfPRsReviewed.toFixed(2) + '%',
        mergedWithoutReviewPercentage: record.percentageOfPRsMergedWithoutReview.toFixed(2) + '%',
        avgTimeToReview: record.averageTimeToFirstReview.toFixed(2) + ' hours'
    });
}

/**
 * Processes service metrics for a single repository
 */
async function processRepositoryServiceMetrics(
    octokit: Octokit,
    repo: Repository,
    repoIndex: number,
    totalRepos: number
): Promise<void> {
    console.log(`Processing service metrics for repo ${repo.name} (${repoIndex + 1}/${totalRepos})`);
    
    try {
        // Fetch all PRs for the repository
        const prs = await fetchRepositoryPRs(octokit, repo.owner.login, repo.name);
        console.log(`Found ${prs.length} PRs in the last 90 days for ${repo.name}`);
        
        // Calculate review metrics
        const reviewData = await calculateRepositoryReviewMetrics(octokit, repo.owner.login, repo.name, prs);
        
        // Calculate final percentages and averages
        const finalMetrics = calculateFinalMetrics(reviewData);
        
        // Create the complete record
        const record = createServiceMetricsRecord(repo, reviewData, finalMetrics);
        
        // Store to Port
        await storeServiceMetrics(record);
        
        // Log summary
        logServiceMetricsSummary(record);
        
    } catch (error) {
        console.error(`Failed to process service metrics for repo ${repo.name}:`, error);
        throw error;
    }
}

/**
 * Main function to calculate and store service metrics for multiple repositories
 */
export async function calculateAndStoreServiceMetrics(repos: Repository[], authToken: string): Promise<void> {
    const octokit = new Octokit({ auth: authToken });
    
    for (const [index, repo] of repos.entries()) {
        try {
            await processRepositoryServiceMetrics(octokit, repo, index, repos.length);
        } catch (error) {
            console.error(`Error processing repo ${repo.name}:`, error);
            // Continue with next repo instead of failing completely
        }
    }
}
