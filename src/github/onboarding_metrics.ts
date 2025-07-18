import { Octokit } from '@octokit/rest';
import { makeRequestWithRetry } from './utils';
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

// Using the shared makeRequestWithRetry implementation from utils.ts

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
                }), authToken
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
                }), authToken
            );

            allPulls.push(...pulls.items);

            // Search for reviews with retry logic
            const { data: reviews } = await makeRequestWithRetry(() =>
                octokit.request('GET /search/issues ', {
                    q: `reviewed-by:${login} type:pr org:${orgName} review:approved`,
                    advanced_search: true,
                }), authToken
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

        
        const record: any = {
            login: login,
            joinDate,
            firstCommitDate,
            tenthCommitDate,
            firstPRDate,
            tenthPRDate,
            timeFromFirstTo10thCommit: tenthCommitDate && firstCommitDate ? (new Date(tenthCommitDate).getTime() - new Date(firstCommitDate).getTime()) / (1000 * 60 * 60) : null,
            timeFromFirstTo10thPR: tenthPRDate && firstPRDate ? (new Date(tenthPRDate).getTime() - new Date(firstPRDate).getTime()) / (1000 * 60 * 60) : null,
        };

        if (joinDate) {
            record.timeToFirstCommit = firstCommitDate ? (new Date(firstCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null;
            record.timeToFirstPR = firstPRDate ? (new Date(firstPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null;
            record.timeTo10thCommit = tenthCommitDate ? (new Date(tenthCommitDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null;
            record.timeTo10thPR = tenthPRDate ? (new Date(tenthPRDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null;
            record.initialReviewResponseTime = firstReviewDate ? (new Date(firstReviewDate).getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60) : null;
        }

        stats.push(record);
        console.log(stats);
        return stats;
    } catch (error) {
        throw new Error(`Failed to fetch developer stats for ${login}: ${error}`);
    }
}

export async function storeDeveloperStats(user: any, record: DeveloperStats) {
    const props: Record<string, any> = _.chain(record)
        .pick(['login', 'joinDate', 'firstCommitDate', 'tenthCommitDate', 'firstPRDate', 'tenthPRDate', 'initialReviewResponseTime', 'timeToFirstCommit', 'timeToFirstPR', 'timeTo10thCommit', 'timeTo10thPR', 'timeFromFirstTo10thCommit', 'timeFromFirstTo10thPR'])
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
