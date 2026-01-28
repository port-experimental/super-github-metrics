import { Command } from "commander";
import type { Logger } from "pino";
import { createGitHubClient } from "../clients/github";
import { getEntities, PortClient } from "../clients/port";
import type {
  GitHubUser,
  AuditLogEntry,
  Repository,
  GitHubClient,
} from "../clients/github";
import type { PortEntity } from "../clients/port";
import {
  calculateAndStoreDeveloperStats,
  hasCompleteOnboardingMetrics,
} from "./onboarding_metrics";
import { calculateAndStorePRMetrics } from "./pr_metrics";
import { calculateAndStoreServiceMetrics } from "./service_metrics";
import { calculateAndStoreTimeSeriesServiceMetrics } from "./service_aggregated_metrics";
import { calculateWorkflowMetrics } from "./workflow_metrics";
import { CONCURRENCY_LIMITS } from "./utils";
import { getGithubEnv, getPortEnv } from "../env";
import { DEFAULT_ONBOARDING_BATCH_SIZE, ONBOARDING_BATCH_DELAY_MS } from "../constants";

/**
 * Custom error class for fatal errors that should cause the process to exit
 */
class FatalError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "FatalError";
  }
}

/**
 * Processes repositories for a specific organization.
 *
 * @param githubClient - GitHub client instance
 * @param orgName - Organization name
 * @param processor - Function to process the repositories
 * @param logger - Logger instance
 */
async function processOrganizationRepositories(
  githubClient: GitHubClient,
  orgName: string,
  processor: (repos: Repository[]) => Promise<void>,
  logger: Logger,
): Promise<void> {
  logger.info(
    { orgName },
    `Processing repositories for organization: ${orgName}`,
  );
  const repos = await githubClient.fetchOrganizationRepositories(orgName);
  logger.info(
    { orgName, count: repos.length },
    `Processing ${repos.length} repositories from ${orgName}`,
  );
  await processor(repos);
}

/**
 * Registers GitHub-related CLI commands.
 *
 * @param program - Commander program instance
 * @param logger - Logger instance
 */
export function registerGithubCommands(program: Command, logger: Logger): void {
  let githubClient!: GitHubClient;
  let GITHUB_ORGS: string[] = [];
  let ENTERPRISE_NAME: string | undefined;

  const ensureGithubClient = () => {
    const githubEnv = getGithubEnv();
    getPortEnv();

    const {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
      installationId: GITHUB_APP_INSTALLATION_ID,
      enterpriseName,
      orgs: GITHUB_ORGS_ENV,
      patTokens: GITHUB_PAT_TOKENS,
    } = githubEnv;

    ENTERPRISE_NAME = enterpriseName;

    if (!GITHUB_APP_ID) {
      logger.warn(
        "X_GITHUB_APP_ID environment variable is not set, will use PATs instead",
      );
    }
    if (!GITHUB_APP_PRIVATE_KEY) {
      logger.warn(
        "X_GITHUB_APP_PRIVATE_KEY environment variable is not set, will use PATs instead",
      );
    }
    if (!GITHUB_APP_INSTALLATION_ID) {
      logger.warn(
        "X_GITHUB_APP_INSTALLATION_ID environment variable is not set, will use PATs instead",
      );
    }
    if (!ENTERPRISE_NAME) {
      logger.warn(
        "X_GITHUB_ENTERPRISE environment variable is not set, will not use enterprise features",
      );
    }
    if (!GITHUB_PAT_TOKENS || GITHUB_PAT_TOKENS.length === 0) {
      logger.warn(
        "X_GITHUB_PAT_TOKENS environment variable is not set, will not use PATs",
      );
    }

    GITHUB_ORGS = GITHUB_ORGS_ENV;

    logger.info("Initializing GitHub client...");
    if (GITHUB_PAT_TOKENS && GITHUB_PAT_TOKENS.length > 0) {
      githubClient = createGitHubClient(
        {
          appId: GITHUB_APP_ID,
          privateKey: GITHUB_APP_PRIVATE_KEY,
          installationId: GITHUB_APP_INSTALLATION_ID,
          enterpriseName: ENTERPRISE_NAME,
          patTokens: GITHUB_PAT_TOKENS,
        },
        logger,
      );
    } else {
      githubClient = createGitHubClient(
        {
          appId: GITHUB_APP_ID,
          privateKey: GITHUB_APP_PRIVATE_KEY,
          installationId: GITHUB_APP_INSTALLATION_ID,
          enterpriseName: ENTERPRISE_NAME,
        },
        logger,
      );
    }
  };

  program.hook("preAction", () => {
    if (githubClient) {
      return;
    }

    ensureGithubClient();
  });

  program
    .command("onboarding-metrics")
    .description("Send onboarding metrics to Port")
    .action(async () => {
      let hasFatalError = false;

      try {
        // Early check: onboarding-metrics requires enterprise audit log access
        if (!ENTERPRISE_NAME) {
          throw new FatalError(
            "onboarding-metrics requires X_GITHUB_ENTERPRISE to be set. Audit log access is an enterprise feature.",
          );
        }

        logger.info("Calculating onboarding metrics...");
        logger.info("Step 1: Checking rate limits...");
        await githubClient.checkRateLimits();

        logger.info("Step 2: Fetching GitHub users from Port...");
        const githubUsers = await getEntities("githubUser");
        logger.info(
          `Found ${githubUsers.entities.length} github users in Port`,
        );

        let joinRecords: AuditLogEntry[] = [];
        // Try fetch join dates from the audit log for each organization concurrently
        try {
          logger.info(
            "Step 3: Fetching member join dates from organization audit logs...",
          );
          logger.info(`Organizations to process: ${GITHUB_ORGS.join(", ")}`);

          const auditLogPromises = GITHUB_ORGS.map(async (orgName) => {
            logger.info(`Fetching audit logs for organization: ${orgName}`);
            try {
              const orgJoinRecords =
                await githubClient.getMemberAddDates(orgName);
              logger.info(
                `Found ${orgJoinRecords.length} join records from ${orgName}`,
              );
              return orgJoinRecords;
            } catch (error) {
              if (
                error instanceof Error &&
                "status" in error &&
                error.status === 403
              ) {
                logger.info(
                  `Insufficient permissions to query audit log for ${orgName}. Skipping...`,
                );
              } else {
                logger.warn(
                  { err: error },
                  `Failed to fetch join records from ${orgName}, continuing without them`,
                );
              }
              return [];
            }
          });

          logger.info("Waiting for all audit log requests to complete...");
          const auditLogResults = await Promise.all(auditLogPromises);
          joinRecords = auditLogResults.flat();
          logger.info(`Total join records found: ${joinRecords.length}`);
        } catch (error) {
          logger.warn(
            { err: error },
            "Failed to fetch join records, continuing without them",
          );
        }

        // Check if we should force processing all users regardless of existing metrics
        const forceProcessing = process.env.FORCE_ONBOARDING_METRICS === "true";

        let usersToProcess: PortEntity[];
        if (forceProcessing) {
          logger.info(
            "FORCE_ONBOARDING_METRICS is enabled - processing all users regardless of existing metrics",
          );
          usersToProcess = githubUsers.entities;
        } else {
          // Only go over users without complete onboarding metrics in Port
          logger.info(
            "Step 4: Filtering users without complete onboarding metrics...",
          );
          usersToProcess = githubUsers.entities.filter(
            (user: PortEntity) => !hasCompleteOnboardingMetrics(user),
          );
          logger.info(
            `Found ${usersToProcess.length} users without complete onboarding metrics`,
          );
        }

        // Process users in batches to avoid overwhelming the system
        const BATCH_SIZE = parseInt(
          process.env.ONBOARDING_BATCH_SIZE || String(DEFAULT_ONBOARDING_BATCH_SIZE),
          10,
        );
        let processedCount = 0;
        let errorCount = 0;
        const usersWithErrors: string[] = [];

        logger.info(
          `Processing ${usersToProcess.length} users in batches of ${BATCH_SIZE}`,
        );

        for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
          const batch = usersToProcess.slice(i, i + BATCH_SIZE);
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(usersToProcess.length / BATCH_SIZE);
          logger.info(
            `Processing batch ${batchNumber}/${totalBatches} (${batch.length} users) - ${Math.round((i / usersToProcess.length) * 100)}% complete`,
          );

          // Process batch concurrently
          const batchPromises = batch.map(async (user, batchIndex) => {
            const userIndex = i + batchIndex;
            logger.info(
              `Processing developer ${userIndex + 1} of ${usersToProcess.length}: ${user.identifier}`,
            );

            try {
              // Ensure user has required properties
              if (!user.identifier) {
                logger.error({ user }, `User missing identifier`);
                return {
                  success: false,
                  user: user.identifier,
                  error: "Missing identifier",
                };
              }

              const joinDate = joinRecords.find(
                (record) => record.user === user.identifier,
              )?.created_at;
              if (!joinDate) {
                logger.error(`No join date found for ${user.identifier}`);
                return {
                  success: false,
                  user: user.identifier,
                  error: "No join date found",
                };
              }
              logger.info(
                `Calculating stats for ${user.identifier} with join date ${joinDate}`,
              );

              // Convert PortEntity to GitHubUser format
              const githubUser: GitHubUser = {
                identifier: user.identifier,
                title: user.title,
                properties: user.properties || {},
                relations: user.relations || undefined,
              };

              await calculateAndStoreDeveloperStats(
                GITHUB_ORGS,
                githubUser,
                joinDate,
                githubClient,
              );

              logger.info(`Successfully processed ${user.identifier}`);
              return { success: true, user: user.identifier };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error(
                `Error processing developer ${user.identifier}: ${errorMessage}`,
              );
              return {
                success: false,
                user: user.identifier,
                error: errorMessage,
              };
            }
          });

          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises);

          // Process batch results
          batchResults.forEach((result) => {
            if (result.success) {
              processedCount++;
            } else {
              errorCount++;
              if (result.user) {
                usersWithErrors.push(result.user);
              }
            }
          });

          logger.info(
            `Batch ${batchNumber}/${totalBatches} completed. Progress: ${processedCount + errorCount}/${usersToProcess.length} users processed (${Math.round(((processedCount + errorCount) / usersToProcess.length) * 100)}% complete)`,
          );

          // Add a small delay between batches to be conservative with rate limits
          if (i + BATCH_SIZE < usersToProcess.length) {
            logger.info(
              { delayMs: ONBOARDING_BATCH_DELAY_MS },
              "Waiting before next batch",
            );
            await new Promise((resolve) => setTimeout(resolve, ONBOARDING_BATCH_DELAY_MS));
          }
        }

        // Print summary
        logger.info("\n=== Processing Summary ===");
        logger.info(`Total users processed: ${processedCount}`);
        logger.info(`Users with errors: ${errorCount}`);
        if (forceProcessing) {
          logger.info(
            "Note: All users were processed due to FORCE_ONBOARDING_METRICS=true",
          );
        }

        if (usersWithErrors.length > 0) {
          logger.info("\nUsers with errors:");
          usersWithErrors.forEach((userId) => logger.info(`- ${userId}`));
        }

        // If all users failed, that's a fatal error
        if (processedCount === 0 && usersToProcess.length > 0) {
          hasFatalError = true;
          throw new FatalError(
            "Failed to process any users for onboarding metrics",
          );
        }
      } catch (error) {
        if (error instanceof FatalError) {
          hasFatalError = true;
          logger.error(error.message);
          process.exit(1);
        }
        logger.error(
          `Unexpected error in onboarding metrics: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        hasFatalError = true;
        throw new FatalError(
          "Unexpected error in onboarding metrics",
          error as Error,
        );
      }

      if (hasFatalError) {
        process.exit(1);
      }
    });

  program
    .command("pr-metrics")
    .description("Send PR metrics to Port")
    .action(async () => {
      let hasFatalError = false;

      try {
        logger.info("Calculating PR metrics...");
        await githubClient.checkRateLimits();

        // Process organizations concurrently
        const orgPromises = GITHUB_ORGS.map(async (orgName) => {
          try {
            await processOrganizationRepositories(
              githubClient,
              orgName,
              async (repos) => {
                await calculateAndStorePRMetrics(repos, githubClient);
              },
              logger,
            );
            return { success: true, orgName };
          } catch (error) {
            logger.error(
              `Error processing organization ${orgName}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            return { success: false, orgName, error };
          }
        });

        const results = await Promise.all(orgPromises);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        logger.info(
          `PR metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`,
        );

        if (failed.length > 0) {
          hasFatalError = true;
          throw new FatalError(
            "Failed to process PR metrics for one or more organizations",
          );
        }
      } catch (error) {
        if (error instanceof FatalError) {
          throw error;
        }
        logger.error(
          `Unexpected error in PR metrics: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        hasFatalError = true;
        throw new FatalError("Unexpected error in PR metrics", error as Error);
      }
    });

  program
    .command("workflow-metrics")
    .description("Send GitHub Workflow metrics to Port")
    .action(async () => {
      let hasFatalError = false;

      try {
        logger.info("Calculating Workflows metrics...");
        await githubClient.checkRateLimits();
        const portClient = await PortClient.getInstance();

        // Process organizations concurrently
        const orgPromises = GITHUB_ORGS.map(async (orgName) => {
          try {
            await calculateWorkflowMetrics(githubClient, portClient, orgName);
            return { success: true, orgName };
          } catch (error) {
            logger.error(
              `Error processing organization ${orgName}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            return { success: false, orgName, error };
          }
        });

        const results = await Promise.all(orgPromises);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        logger.info(
          `Workflow metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`,
        );

        if (failed.length > 0) {
          hasFatalError = true;
          throw new FatalError(
            "Failed to process workflow metrics for one or more organizations",
          );
        }
      } catch (error) {
        if (error instanceof FatalError) {
          throw error;
        }
        logger.error(
          `Unexpected error in workflow metrics: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        hasFatalError = true;
        throw new FatalError(
          "Unexpected error in workflow metrics",
          error as Error,
        );
      }
    });

  program
    .command("service-metrics")
    .description("Send GitHub Service metrics to Port")
    .action(async () => {
      let hasFatalError = false;

      try {
        logger.info("Calculating Service metrics...");
        await githubClient.checkRateLimits();

        // Process organizations concurrently
        const orgPromises = GITHUB_ORGS.map(async (orgName) => {
          try {
            await processOrganizationRepositories(
              githubClient,
              orgName,
              async (repos) => {
                await calculateAndStoreServiceMetrics(repos, githubClient);
              },
              logger,
            );
            return { success: true, orgName };
          } catch (error) {
            logger.error(
              `Error processing organization ${orgName}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            return { success: false, orgName, error };
          }
        });

        const results = await Promise.all(orgPromises);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        logger.info(
          `Service metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`,
        );

        if (failed.length > 0) {
          hasFatalError = true;
          throw new FatalError(
            "Failed to process service metrics for one or more organizations",
          );
        }
      } catch (error) {
        if (error instanceof FatalError) {
          throw error;
        }
        logger.error(
          `Unexpected error in service metrics: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        hasFatalError = true;
        throw new FatalError(
          "Unexpected error in service metrics",
          error as Error,
        );
      }
    });

  program
    .command("timeseries-service-metrics")
    .description("Send GitHub Time-Series Service metrics to Port")
    .option(
      "-p, --period-type <type>",
      "Time period type (daily, weekly, monthly)",
      "daily",
    )
    .option("-d, --days-back <number>", "Number of days to look back", "90")
    .action(async (options) => {
      let hasFatalError = false;

      try {
        logger.info("Calculating Time-Series Service metrics...");
        await githubClient.checkRateLimits();

        const periodType = options.periodType as "daily" | "weekly" | "monthly";
        const daysBack = parseInt(options.daysBack, 10);

        logger.info(
          `Processing ${periodType} metrics for the last ${daysBack} days`,
        );

        // Process organizations concurrently
        const orgPromises = GITHUB_ORGS.map(async (orgName) => {
          try {
            await processOrganizationRepositories(
              githubClient,
              orgName,
              async (repos) => {
                await calculateAndStoreTimeSeriesServiceMetrics(
                  repos,
                  periodType,
                  daysBack,
                  githubClient,
                );
              },
              logger,
            );
            return { success: true, orgName };
          } catch (error) {
            logger.error(
              `Error processing organization ${orgName}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            return { success: false, orgName, error };
          }
        });

        const results = await Promise.all(orgPromises);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        logger.info(
          `Time-series service metrics processing complete: ${successful.length} organizations successful, ${failed.length} failed`,
        );

        if (failed.length > 0) {
          hasFatalError = true;
          throw new FatalError(
            "Failed to process time-series service metrics for one or more organizations",
          );
        }
      } catch (error) {
        if (error instanceof FatalError) {
          throw error;
        }
        logger.error(
          `Unexpected error in time-series service metrics: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        throw new FatalError(
          "Unexpected error in time-series service metrics",
          error as Error,
        );
      }
    });

  program
    .command("list-user-additions")
    .description("List all user addition events from organization audit logs")
    .action(async () => {
      let hasFatalError = false;

      try {
        // Early check: list-user-additions requires enterprise audit log access
        if (!ENTERPRISE_NAME) {
          throw new FatalError(
            "list-user-additions requires X_GITHUB_ENTERPRISE to be set. Audit log access is an enterprise feature.",
          );
        }

        logger.info(
          "Fetching user addition events from organization audit logs...",
        );
        await githubClient.checkRateLimits();

        logger.info(`Organizations to query: ${GITHUB_ORGS.join(", ")}`);
        logger.info("=".repeat(80));

        let totalEvents = 0;
        const allEvents: any[] = [];

        for (const orgName of GITHUB_ORGS) {
          try {
            logger.info(
              `\n📋 Fetching audit logs for organization: ${orgName}`,
            );
            const orgEvents = await githubClient.getAuditLog({
              phrase: `action:org.add_member org:${orgName}`,
            });

            logger.info(
              `Found ${orgEvents.length} user addition events in ${orgName}`,
            );

            if (orgEvents.length > 0) {
              logger.info(`\n👥 User addition events for ${orgName}:`);
              logger.info("-".repeat(60));

              orgEvents.forEach((event, index) => {
                logger.info(`${index + 1}. RAW EVENT DATA:`);
                logger.info(JSON.stringify(event, null, 2));
                logger.info("");
              });
            } else {
              logger.info(`   No user addition events found in ${orgName}`);
            }

            allEvents.push(...orgEvents);
            totalEvents += orgEvents.length;
          } catch (error) {
            if (
              error instanceof Error &&
              "status" in error &&
              error.status === 403
            ) {
              logger.info(
                `❌ Insufficient permissions to query audit log for ${orgName}`,
              );
              logger.info(
                '   Make sure the GitHub App has "Administration" read permissions',
              );
              logger.info({ err: error }, "Original error");
            } else {
              logger.error(
                { err: error },
                `❌ Error fetching audit logs for ${orgName}`,
              );
            }
          }
        }

        logger.info("\n" + "=".repeat(80));
        logger.info("📊 SUMMARY");
        logger.info("=".repeat(80));
        logger.info(`Total organizations queried: ${GITHUB_ORGS.length}`);
        logger.info(`Total user addition events found: ${totalEvents}`);

        if (allEvents.length > 0) {
          const uniqueUsers = new Set(allEvents.map((event) => event.user));
          logger.info(`Unique users found: ${uniqueUsers.size}`);

          logger.info("\n📅 Events by date:");
          const eventsByDate = allEvents.reduce(
            (acc, event) => {
              const timestamp = event["@timestamp"] || event.created_at;
              const date = timestamp ? timestamp.split("T")[0] : "unknown"; // Get just the date part
              acc[date] = (acc[date] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

          Object.entries(eventsByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([date, count]) => {
              logger.info(`   ${date}: ${count} addition(s)`);
            });

          logger.info("\n👤 All unique users:");
          Array.from(uniqueUsers)
            .sort()
            .forEach((user, index) => {
              logger.info(`   ${index + 1}. ${user}`);
            });

          logger.info("\n🔍 Sample of available fields in raw data:");
          if (allEvents.length > 0) {
            const sampleEvent = allEvents[0];
            const fields = Object.keys(sampleEvent).sort();
            logger.info(`   Available fields: ${fields.join(", ")}`);
          }
        }
      } catch (error) {
        if (error instanceof FatalError) {
          hasFatalError = true;
          logger.error(error.message);
          process.exit(1);
        }
        logger.error(
          `Unexpected error listing user additions: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        hasFatalError = true;
        throw new FatalError(
          "Unexpected error listing user additions",
          error as Error,
        );
      }

      if (hasFatalError) {
        process.exit(1);
      }
    });
}
