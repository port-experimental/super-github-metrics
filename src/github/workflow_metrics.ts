import { createGitHubClient } from '../clients/github';
import { upsertProps } from '../clients/port';
import type { GitHubRepository, Repository } from '../types/github';
import { CONCURRENCY_LIMITS } from './utils';

interface RepositoryWorkflowMetrics {
  repositoryName: string;
  workflowId: string;
  workflowName: string;
  medianDuration_last_30_days: number;
  maxDuration_last_30_days: number;
  minDuration_last_30_days: number;
  meanDuration_last_30_days: number;
  totalRuns_last_30_days: number;
  totalFailures_last_30_days: number;
  successRate_last_30_days: number;
  medianDuration_last_90_days: number;
  maxDuration_last_90_days: number;
  minDuration_last_90_days: number;
  meanDuration_last_90_days: number;
  totalRuns_last_90_days: number;
  totalFailures_last_90_days: number;
  successRate_last_90_days: number;
}

interface WorkflowRun {
  workflowRunId: string;
  workflowId: string;
  workflowName: string;
  workflowStatus: string;
  workflowRunNumber: string;
  workflowRunStartedAt: string;
  workflowRunCompletedAt: string;
  workflowRunDuration: number;
  workflowEvent: string;
}

// Using the shared makeRequestWithRetry implementation from utils.ts

export async function getWorkflowMetrics(
  repos: GitHubRepository[] | Repository[],
  authToken: string
): Promise<RepositoryWorkflowMetrics[]> {
  const workflowMetrics: RepositoryWorkflowMetrics[] = [];
  const githubClient = createGitHubClient(authToken);
  let hasFatalError = false;
  const failedRepos: string[] = [];

  for (const [index, repository] of repos.entries()) {
    try {
      console.log(`Getting workflow metrics for ${repository.name} (${index + 1}/${repos.length})`);
      const workflowMetricMap = new Map<string, WorkflowRun[]>();

      const runs = await githubClient.getWorkflowRuns(
        repository.owner.login,
        repository.name,
        repository.default_branch
      );

      for (const run of runs) {
        const workflowRun: WorkflowRun = {
          workflowRunId: run.id.toString(),
          workflowId: run.workflow_id.toString(),
          workflowName: run.name ?? '',
          workflowStatus: run.conclusion ?? '',
          workflowRunNumber: run.run_number.toString(),
          workflowRunStartedAt: run.run_started_at ?? '',
          workflowRunCompletedAt: run.updated_at ?? '',
          // in seconds
          workflowRunDuration:
            run.updated_at && run.run_started_at
              ? (new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000
              : 0,
          workflowEvent: run.event,
        };

        // Add the workflow run to the map
        const workflowRuns = workflowMetricMap.get(run.workflow_id.toString()) || [];
        workflowRuns.push(workflowRun);
        workflowMetricMap.set(run.workflow_id.toString(), workflowRuns);
      }

      // Calculate metrics for each workflow
      for (const [_workflowId, workflowRuns] of workflowMetricMap.entries()) {
        if (workflowRuns.length === 0) {
          continue;
        }

        const sortedRuns = workflowRuns.sort(
          (a, b) =>
            new Date(a.workflowRunStartedAt).getTime() - new Date(b.workflowRunStartedAt).getTime()
        );
        const last30DaysRuns = sortedRuns.filter(
          (run) =>
            new Date(run.workflowRunStartedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );
        const last90DaysRuns = sortedRuns.filter(
          (run) =>
            new Date(run.workflowRunStartedAt) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        );
        const last30DaysSuccessRuns = last30DaysRuns.filter(
          (run) => run.workflowStatus === 'success'
        );
        const last90DaysSuccessRuns = last90DaysRuns.filter(
          (run) => run.workflowStatus === 'success'
        );
        
        // Filter runs to only include success and failure (exclude cancelled, skipped, etc.)
        const last30DaysCompletedRuns = last30DaysRuns.filter(
          (run) => run.workflowStatus === 'success' || run.workflowStatus === 'failure'
        );
        const last90DaysCompletedRuns = last90DaysRuns.filter(
          (run) => run.workflowStatus === 'success' || run.workflowStatus === 'failure'
        );

        try {
          await upsertProps('githubWorkflow', `${repository.name}${workflowRuns[0].workflowId}`, {
            medianDuration_last_30_days:
              last30DaysSuccessRuns[Math.floor(last30DaysSuccessRuns.length / 2)]
                ?.workflowRunDuration ?? 0,
            maxDuration_last_30_days: last30DaysSuccessRuns.reduce(
              (acc, run) => Math.max(acc, run.workflowRunDuration),
              0
            ),
            minDuration_last_30_days: last30DaysSuccessRuns.reduce(
              (acc, run) => Math.min(acc, run.workflowRunDuration),
              0
            ),
            meanDuration_last_30_days:
              last30DaysSuccessRuns.reduce((acc, run) => acc + run.workflowRunDuration, 0) /
              last30DaysSuccessRuns.length,
            totalRuns_last_30_days: last30DaysCompletedRuns.length,
            totalFailures_last_30_days: last30DaysCompletedRuns.filter(
              (run) => run.workflowStatus === 'failure'
            ).length,
            successRate_last_30_days: last30DaysCompletedRuns.length > 0 
              ? (last30DaysSuccessRuns.length / last30DaysCompletedRuns.length) * 100 
              : 0,
            medianDuration_last_90_days:
              last90DaysSuccessRuns[Math.floor(last90DaysSuccessRuns.length / 2)]
                ?.workflowRunDuration ?? 0,
            maxDuration_last_90_days: last90DaysSuccessRuns.reduce(
              (acc, run) => Math.max(acc, run.workflowRunDuration),
              0
            ),
            minDuration_last_90_days: last90DaysSuccessRuns.reduce(
              (acc, run) => Math.min(acc, run.workflowRunDuration),
              0
            ),
            meanDuration_last_90_days:
              last90DaysSuccessRuns.reduce((acc, run) => acc + run.workflowRunDuration, 0) /
              last90DaysSuccessRuns.length,
            totalRuns_last_90_days: last90DaysCompletedRuns.length,
            totalFailures_last_90_days: last90DaysCompletedRuns.filter(
              (run) => run.workflowStatus === 'failure'
            ).length,
            successRate_last_90_days: last90DaysCompletedRuns.length > 0 
              ? (last90DaysSuccessRuns.length / last90DaysCompletedRuns.length) * 100 
              : 0,
          });
        } catch (error) {
          console.error(`Failed to update workflow metrics for ${repository.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue with next workflow instead of failing the entire repo
        }
      }
    } catch (error) {
      console.error(`Error processing workflow metrics for repo ${repository.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failedRepos.push(repository.name);
      hasFatalError = true;
    }
  }

  // If all repositories failed, that's a fatal error
  if (failedRepos.length === repos.length && repos.length > 0) {
    throw new Error(`Failed to process any repositories. Failed repos: ${failedRepos.join(', ')}`);
  }

  // If some repositories failed, log a warning but don't fail the entire process
  if (failedRepos.length > 0) {
    console.warn(
      `Warning: Failed to process ${failedRepos.length} repositories: ${failedRepos.join(', ')}`
    );
  }

  // If there were any fatal errors and no successful processing, throw an error
  if (hasFatalError && failedRepos.length === repos.length) {
    throw new Error('All repositories failed to process');
  }

  // Calculate metrics for each workflow
  return workflowMetrics;
}

export async function calculateWorkflowMetrics(
  githubClient: any,
  portClient: any,
  orgName: string
): Promise<void> {
  const repos = await githubClient.fetchOrganizationRepositories(orgName);
  
  // Process repositories concurrently with a reasonable concurrency limit
  const concurrencyLimit = CONCURRENCY_LIMITS.REPOSITORIES; // Use the global constant
  const results: Array<{ success: boolean; repoName: string; error?: any }> = [];

  for (let i = 0; i < repos.length; i += concurrencyLimit) {
    const batch = repos.slice(i, i + concurrencyLimit);
    console.log(`Processing workflow batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(repos.length / concurrencyLimit)} (${batch.length} repos)`);

    const batchPromises = batch.map(async (repository: Repository) => {
      try {
        console.log(`Getting workflow metrics for ${repository.name}`);
        const workflowMetricMap = new Map<string, WorkflowRun[]>();

        const runs = await githubClient.getWorkflowRuns(
          repository.owner.login,
          repository.name,
          repository.default_branch
        );

        for (const run of runs) {
          const workflowRun: WorkflowRun = {
            workflowRunId: run.id.toString(),
            workflowId: run.workflow_id.toString(),
            workflowName: run.name ?? '',
            workflowStatus: run.conclusion ?? '',
            workflowRunNumber: run.run_number.toString(),
            workflowRunStartedAt: run.run_started_at ?? '',
            workflowRunCompletedAt: run.updated_at ?? '',
            // in seconds
            workflowRunDuration:
              run.updated_at && run.run_started_at
                ? (new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000
                : 0,
            workflowEvent: run.event,
          };

          // Add the workflow run to the map
          const workflowRuns = workflowMetricMap.get(run.workflow_id.toString()) || [];
          workflowRuns.push(workflowRun);
          workflowMetricMap.set(run.workflow_id.toString(), workflowRuns);
        }

        // Process all workflows concurrently
        const workflowPromises = Array.from(workflowMetricMap.entries()).map(async ([_workflowId, workflowRuns]) => {
          if (workflowRuns.length === 0) {
            return { success: true, workflowId: _workflowId };
          }

          try {
            const sortedRuns = workflowRuns.sort(
              (a, b) =>
                new Date(a.workflowRunStartedAt).getTime() - new Date(b.workflowRunStartedAt).getTime()
            );
            const last30DaysRuns = sortedRuns.filter(
              (run) =>
                new Date(run.workflowRunStartedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            );
            const last90DaysRuns = sortedRuns.filter(
              (run) =>
                new Date(run.workflowRunStartedAt) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            );
            const last30DaysSuccessRuns = last30DaysRuns.filter(
              (run) => run.workflowStatus === 'success'
            );
            const last90DaysSuccessRuns = last90DaysRuns.filter(
              (run) => run.workflowStatus === 'success'
            );
            
            // Filter runs to only include success and failure (exclude cancelled, skipped, etc.)
            const last30DaysCompletedRuns = last30DaysRuns.filter(
              (run) => run.workflowStatus === 'success' || run.workflowStatus === 'failure'
            );
            const last90DaysCompletedRuns = last90DaysRuns.filter(
              (run) => run.workflowStatus === 'success' || run.workflowStatus === 'failure'
            );

            // Store the metrics using the provided port client
            await portClient.upsertProps('githubWorkflow', `${repository.name}-${workflowRuns[0].workflowId}`, {
              repositoryName: repository.name,
              workflowId: workflowRuns[0].workflowId,
              workflowName: workflowRuns[0].workflowName,
              medianDuration_last_30_days:
                last30DaysSuccessRuns[Math.floor(last30DaysSuccessRuns.length / 2)]
                  ?.workflowRunDuration ?? 0,
              maxDuration_last_30_days: last30DaysSuccessRuns.reduce(
                (acc, run) => Math.max(acc, run.workflowRunDuration),
                0
              ),
              minDuration_last_30_days: last30DaysSuccessRuns.reduce(
                (acc, run) => Math.min(acc, run.workflowRunDuration),
                0
              ),
              meanDuration_last_30_days:
                last30DaysSuccessRuns.reduce((acc, run) => acc + run.workflowRunDuration, 0) /
                last30DaysSuccessRuns.length,
              totalRuns_last_30_days: last30DaysCompletedRuns.length,
              totalFailures_last_30_days: last30DaysCompletedRuns.filter(
                (run) => run.workflowStatus === 'failure'
              ).length,
              successRate_last_30_days: last30DaysCompletedRuns.length > 0 
                ? (last30DaysSuccessRuns.length / last30DaysCompletedRuns.length) * 100 
                : 0,
              medianDuration_last_90_days:
                last90DaysSuccessRuns[Math.floor(last90DaysSuccessRuns.length / 2)]
                  ?.workflowRunDuration ?? 0,
              maxDuration_last_90_days: last90DaysSuccessRuns.reduce(
                (acc, run) => Math.max(acc, run.workflowRunDuration),
                0
              ),
              minDuration_last_90_days: last90DaysSuccessRuns.reduce(
                (acc, run) => Math.min(acc, run.workflowRunDuration),
                0
              ),
              meanDuration_last_90_days:
                last90DaysSuccessRuns.reduce((acc, run) => acc + run.workflowRunDuration, 0) /
                last90DaysSuccessRuns.length,
              totalRuns_last_90_days: last90DaysCompletedRuns.length,
              totalFailures_last_90_days: last90DaysCompletedRuns.filter(
                (run) => run.workflowStatus === 'failure'
              ).length,
              successRate_last_90_days: last90DaysCompletedRuns.length > 0 
                ? (last90DaysSuccessRuns.length / last90DaysCompletedRuns.length) * 100 
                : 0,
            });

            return { success: true, workflowId: _workflowId };
          } catch (error) {
            console.error(`Failed to update workflow metrics for ${repository.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false, workflowId: _workflowId, error };
          }
        });

        // Wait for all workflows in this repository to complete
        const workflowResults = await Promise.all(workflowPromises);
        const successfulWorkflows = workflowResults.filter(r => r.success).length;
        const failedWorkflows = workflowResults.filter(r => !r.success).length;
        
        console.log(`Repository ${repository.name}: ${successfulWorkflows} workflows successful, ${failedWorkflows} failed`);
        return { success: true, repoName: repository.name };
      } catch (error) {
        console.error(`Error processing workflow metrics for repo ${repository.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { success: false, repoName: repository.name, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  // Process results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Workflow metrics processing complete: ${successful.length} repositories successful, ${failed.length} failed`);
}
