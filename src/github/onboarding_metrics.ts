import { Octokit } from '@octokit/rest';
import _ from 'lodash';
import { upsertEntity } from './port_client';

interface DeveloperStats {
    login: string;
    joinDate: string | null;
    firstCommitDate: string | null;
    tenthCommitDate: string | null;
    firstPRDate: string | null;
    tenthPRDate: string | null;
    timeToFirstCommit: number | null;
    timeToFirstPR: number | null;
    timeTo10thCommit: number | null;
    timeTo10thPR: number | null;
    initialReviewResponseTime: number | null;
}

/**
* We can look up the join date to the org where the customer is using Github Enterprise
* 
* @param enterprise 
* @param authToken 
*/
export async function getMemberAddDates(
    enterprise: string,
    authToken: string
): Promise<any[]> {
    const octokit = new Octokit({ auth: authToken });
    console.log(enterprise);

    let data = await octokit.paginate('GET /enterprises/{enterprise}/audit-log', {
        enterprise,
        phrase: "action:org.add_member",
        include: "web",
        per_page: 100,
        order: 'desc',
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    
    data = data.filter((x: any) => x.org_id === 177709801);
    console.log(`Fetched ${data.length} audit log events`);
    console.log(JSON.stringify(data));
    
    return data.map((x: any) => ({ user: x.user, userId: x.user_id, createdAt: x.created_at }));;
}

export async function getRepositories(
    orgNames: string[],
    authToken: string
): Promise<any[]> {
    const octokit = new Octokit({ auth: authToken });
    const repos: any[] = [];
    for (const orgName of orgNames) {
        const { data: orgRepos } = await octokit.repos.listForOrg({
            org: orgName,
            sort: 'pushed', // default = direction: desc
            per_page: 100,
        });
        repos.push(...orgRepos);
    }
    
    return repos;
}

export async function calculateAndStoreDeveloperStats(
    orgNames: string[],
    authToken: string,
    user: any,
    joinDate: string 
): Promise<void> {
    const stats = await getDeveloperStats(orgNames, authToken, user.identifier, joinDate);
    const record = stats.find(rec => rec.login === user.identifier);
    if (!record) {
        console.log(`No record found for ${user.identifier}, unprocessable, skipping...`);
        return;
    }
    console.log(record);
    return await storeDeveloperStats(user, record);
}

export async function getDeveloperStats(
    orgNames: string[],
    authToken: string,
    login: string,
    joinDate: string 
): Promise<DeveloperStats[]> {
    const octokit = new Octokit({ auth: authToken });
    const stats: DeveloperStats[] = [];
    
    try {
        console.log(`Getting stats for ${login}`);
        let firstCommitDate: string | null = null;
        let tenthCommitDate: string | null = null;
        let firstPRDate: string | null = null;
        let tenthPRDate: string | null = null;
        let allCommits: any[] = [];
        let allPulls: any[] = [];
        let allReviews: any[] = [];
        
        for (const orgName of orgNames) {
            // Helper function to make API requests with exponential backoff
            const makeRequestWithRetry = async (requestFn: () => Promise<any>, maxRetries = 5) => {
                let lastError: any;
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        return await requestFn();
                    } catch (error: any) {
                        lastError = error;

                        // Check if it's a rate limit or 403 error
                        if (error.status === 403 || error.status === 429) {
                            const retryAfter = error.response?.headers?.['retry-after'] || Math.pow(2, attempt);
                            const waitTime = parseInt(retryAfter) * 1000; // Convert to milliseconds

                            console.log(`Rate limited (${error.status}). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries + 1}`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }

                        // For other errors, throw immediately
                        throw error;
                    }
                }
                throw lastError;
            };

            // Search for first commit with retry logic
            const { data: commits } = await makeRequestWithRetry(() =>
                octokit.request('GET /search/commits ', {
                    q: `author:${login} org:${orgName} sort:committer-date-asc`,
                    advanced_search: true,
                    per_page: 10,
                    page: 1,
                    headers: {
                        'If-None-Match': '', // Bypass cache to avoid stale results
                        'Accept': 'application/vnd.github.v3+json' // Specify API version
                    }
                })
            );

            allCommits.push(...commits.items);
            
            // Search for first pull request with retry logic
            const { data: pulls } = await makeRequestWithRetry(() =>
                octokit.request('GET /search/issues ', {
                    q: `author:${login} type:pr org:${orgName} is:merged`,
                    advanced_search: true,
                    sort: 'created',
                    order: 'asc',
                    per_page: 10,
                    headers: {
                        'If-None-Match': '', // Bypass cache to avoid stale results
                        'Accept': 'application/vnd.github.v3+json' // Specify API version
                    }
                })
            );

            allPulls.push(...pulls.items);

            // Search for reviews with retry logic
            const { data: reviews } = await makeRequestWithRetry(() =>
                octokit.request('GET /search/issues ', {
                    q: `reviewed-by:${login} type:pr org:${orgName} review:approved`,
                    advanced_search: true,
                })
            );
            allReviews.push(...reviews.items);
        }

        allCommits.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        if (allCommits.length > 0) {
            firstCommitDate = allCommits.length > 0 ? allCommits[0].commit.author.date : null;
            tenthCommitDate = allCommits.length > 9 ? allCommits[9].commit.author.date : null;
        }
        allPulls.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        if (allPulls.length > 0) {
            firstPRDate = allPulls.length > 0 ? allPulls[0].created_at : null;
            tenthPRDate = allPulls.length > 9 ? allPulls[9].created_at : null;
        }
        
        const firstReviewDate = allReviews.length > 0 ? allReviews.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0].created_at : null;

        
        // Search for initial review response time
        stats.push({
            login: login,
            joinDate,
            firstCommitDate,
            tenthCommitDate,
            firstPRDate,
            tenthPRDate,
            // Times in hours
            timeToFirstCommit: firstCommitDate ? (new Date(firstCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null,
            timeToFirstPR: firstPRDate ? (new Date(firstPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null,
            timeTo10thCommit: tenthCommitDate ? (new Date(tenthCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null,
            timeTo10thPR: tenthPRDate ? (new Date(tenthPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null,
            initialReviewResponseTime: firstReviewDate ? (new Date(firstReviewDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null,
        });
        
        console.log(stats);
        return stats;
    } catch (error) {
        throw new Error(`Failed to fetch developer stats for ${login}: ${error}`);
    }
}

export async function storeDeveloperStats(user: any, record: DeveloperStats) {
    const props: Record<string, any> = _.chain(record)
        .pick(['login', 'joinDate', 'firstCommitDate', 'tenthCommitDate', 'firstPRDate', 'tenthPRDate', 'initialReviewResponseTime', 'timeToFirstCommit', 'timeToFirstPR', 'timeTo10thCommit', 'timeTo10thPR'])
        .mapKeys((_value, key) => key != 'joinDate' ? _.snakeCase(key.replace('Date', '')) : 'join_date');
    
    try {
        console.log(`attempting to update ${user.identifier}`);
        console.log(`Setting props: ${JSON.stringify(props)}`);
        await upsertEntity(
            'githubUser',
            user.identifier,
            user.title,
            props,
            user.relations
        );
        console.log(`Updated first commit and PR dates for user ${user.identifier}`);
    } catch (error) {
        console.error(`Failed to update user ${user.identifier}:`, error);
    }
}

export function hasCompleteOnboardingMetrics(user: any) {
    return user.properties.first_commit && user.properties.tenth_commit && user.properties.first_pr && user.properties.tenth_pr
    && user.properties.time_to_first_commit && user.properties.time_to_first_pr && user.properties.time_to_10th_commit && user.properties.time_to_10th_pr
    && user.properties.initial_review_response_time;
}
