import { Octokit } from '@octokit/rest';
import { Command } from 'commander';
import { getEntities, upsertEntity } from '../port_client';

interface DeveloperStats {
  login: string;
  firstCommitDate: string | null;
  tenthCommitDate: string | null;
  firstPRDate: string | null;
  tenthPRDate: string | null;
}

async function checkRateLimits(authToken: string) {
  const octokit = new Octokit({ auth: authToken });
  // Let's check I'm not at risk of getting banned for API abuse
  const resp = await octokit.rateLimit.get();
  const limit = resp.headers['x-ratelimit-limit'];
  const remaining = Number.parseInt(resp.headers['x-ratelimit-remaining'] || "0");
  const used = resp.headers['x-ratelimit-used'];
  const resetTime = new Date(Number.parseInt(resp.headers['x-ratelimit-reset'] || "") * 1000);
  const secondsUntilReset = Math.floor((resetTime.getTime() - Date.now()) / 1000);
  console.log(`${remaining} requests left, used ${used}/${limit}. Reset at ${resetTime} (${secondsUntilReset}s)`)
  if (remaining === 0) {
    throw Error("Rate limit exceeded");
  }

}

/**
 * We can look up the join date to the org where the customer is using Github Enterprise
 * 
 * @param enterprise 
 * @param authToken 
 */
async function getMemberAddDates(
  enterprise: string,
  authToken: string
): Promise<any[]> {
  const octokit = new Octokit({ auth: authToken });

  const response = await octokit.request(`GET /enterprises/${enterprise}/audit-log`, {
    phrase: "action:org.add_member",
    include: "web",
    // enterprise: 'ENTERPRISE',
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  return response.data.map((x: any) => ({ user: x.user, userId: x.user_id, createdAt: x.created_at }));;
}

async function getDeveloperStats(
  orgName: string,
  authToken: string
): Promise<DeveloperStats[]> {
  const octokit = new Octokit({ auth: authToken });
  const stats: DeveloperStats[] = [];

  try {

    // Get all members of the organization and their first and tenth commit dates
    const { data: members } = await octokit.orgs.listMembers({
      org: orgName,
      per_page: 100,
    });

    // Get all repositories in the organization
    const { data: repos } = await octokit.repos.listForOrg({
      org: orgName,
      per_page: 100,
    });

    for (const member of members) {
      console.log(member);
      let firstCommitDate: string | null = null;
      let tenthCommitDate: string | null = null;
      let firstPRDate: string | null = null;
      let tenthPRDate: string | null = null;
      let allCommits: string[] = [];

      // Search for first commit
      for (const repo of repos) {
        try {
          const { data: commits } = await octokit.repos.listCommits({
            owner: orgName,
            repo: repo.name,
            author: member.login,
            per_page: 10,
            order: 'asc',
          });

          if (commits.length > 0) {
            commits.forEach(commit => {
              if (commit.commit.author?.date) {
                allCommits.push(commit.commit.author.date);
              }
            });
          }
        allCommits.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        if (allCommits.length > 0) {
          firstCommitDate = allCommits.length > 0 ? allCommits[0] : null;
          tenthCommitDate = allCommits.length > 9 ? allCommits[9] : null;
        }
        } catch (error) {
          console.warn(`Error fetching commits for ${repo.name}: ${error}`);
        }
      }

      // Search for first PR
      try {
        // Use more specific search query and add state to filter only merged PRs
        const { data: pulls } = await octokit.search.issuesAndPullRequests({
          q: `author:${member.login} type:pr org:${orgName} is:merged`,
          sort: 'created',
          order: 'asc',
          per_page: 10,
          headers: {
            'If-None-Match': '', // Bypass cache to avoid stale results
            'Accept': 'application/vnd.github.v3+json' // Specify API version
          }
        });

        firstPRDate = pulls.items.length > 0 ? pulls.items[0].created_at : null;
        tenthPRDate = pulls.items.length > 9 ? pulls.items[9].created_at : null;
      } catch (error) {
        console.warn(`Error fetching PRs for ${member.login}: ${error}`);
      }

      stats.push({
        login: member.login,
        firstCommitDate,
        tenthCommitDate,
        firstPRDate,
        tenthPRDate,
      });
    }

    return stats;
  } catch (error) {
    throw new Error(`Failed to fetch developer stats: ${error}`);
  }
}

async function main() {
  const ORG_NAME = process.env.X_GITHUB_ORG;
  const ENTERPRISE_NAME = process.env.X_GITHUB_ENTERPRISE;
  const AUTH_TOKEN = process.env.X_GITHUB_AUTH_TOKEN;
  const PORT_CLIENT_ID = process.env.PORT_CLIENT_ID;
  const PORT_CLIENT_SECRET = process.env.PORT_CLIENT_SECRET;

  if (!ORG_NAME || !AUTH_TOKEN) {
    console.log('Please provide env vars X_GITHUB_ORG and X_GITHUB_AUTH_TOKEN');
    process.exit(0);
  }

  if (!PORT_CLIENT_ID || !PORT_CLIENT_SECRET) {
    console.log('Please provide env vars PORT_CLIENT_ID and PORT_CLIENT_SECRET');
    process.exit(0);
  }

  try {
    // TODO - get the right users from port (no point fetching non-users)

    await checkRateLimits(AUTH_TOKEN);
    const githubUsers = await getEntities('githubUser');
    console.log(githubUsers);

    const program = new Command();

    program
      .name('github-stats')
      .description('CLI to fetch GitHub organization statistics');

    program
      .command('get-member-join-dates')
      .description('Get member add dates for a GitHub enterprise')
      .action(async () => {
        if (!ENTERPRISE_NAME) {
          console.error('Please provide GITHUB_ENTERPRISE env var');
          process.exit(1);
        }
        const joinRecords = await getMemberAddDates(ENTERPRISE_NAME, AUTH_TOKEN);
        console.log(joinRecords);

        // write the data to port 
        for (const user of githubUsers.entities) {
          const joinDate = joinRecords.find(record => record.user === user.identifier)?.createdAt;
          
          if (joinDate) {
            try {
              console.log(`attempting to update ${user.identifier}`);
              await upsertEntity(
                'githubUser',
                user.identifier,
                user.title,
                {
                  ...user.properties,
                  join_date: new Date(joinDate)
                },
                user.relations
              );
              console.log(`Updated join date for user ${user.identifier}`);
            } catch (error) {
              console.error(`Failed to update user ${user.identifier}:`, error);
            }
          }
        }
      });

    program
      .command('get-developer-stats') 
      .description('Get developer statistics for an organization')
      .action(async () => {
        await checkRateLimits(AUTH_TOKEN);
        const stats = await getDeveloperStats(ORG_NAME, AUTH_TOKEN);
        console.table(stats);
        for (const user of githubUsers.entities) {
          const { firstCommitDate, tenthCommitDate, firstPRDate, tenthPRDate } = stats.find(record => record.login === user.identifier) || {};
          
          const props: Record<string, Date> = {};
          if (!firstCommitDate && !firstPRDate && !tenthCommitDate && !tenthPRDate) {
            continue;
          }
          
          if (firstCommitDate) {
            props['first_commit'] = new Date(firstCommitDate);
          }

          if (tenthCommitDate) {
            props['tenth_commit'] = new Date(tenthCommitDate);
          }

          if (firstPRDate) {
            props['first_pr'] = new Date(firstPRDate);
          }

          if (tenthPRDate) {
            props['tenth_pr'] = new Date(tenthPRDate);
          }

          try {
            console.log(`attempting to update ${user.identifier}`);
            await upsertEntity(
              'githubUser',
              user.identifier,
              user.title,
              {
                ...user.properties,
                ...props
              },
              user.relations
            );
            console.log(`Updated first commit and PR dates for user ${user.identifier}`);
          } catch (error) {
            console.error(`Failed to update user ${user.identifier}:`, error);
          }
        }
      });

    await program.parseAsync();

  } catch (error) {
    console.error('Error:', error);
  }
}

export { checkRateLimits, getMemberAddDates, getDeveloperStats };

main();