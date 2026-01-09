import { Command } from "commander";
import type { Logger } from "pino";
import { upsertEntity } from "../clients/port/client";
import {
  createWorkspace,
  getTemplates,
  getWorkspaces,
} from "../clients/coder/client";
import { getPortEnv } from "../env";

export function registerCoderCommands(command: Command, logger: Logger): void {
  command.hook("preAction", () => {
    try {
      getPortEnv();
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : "Missing Port credentials",
      );
      process.exit(0);
    }
  });

  command
    .command("fetch-templates")
    .description("Get Coder templates")
    .action(async () => {
      logger.info("fetching templates");
      const templates = await getTemplates();
      for (const template of templates) {
        await upsertEntity(
          "coder_template",
          `${template.organization_id}-${template.id}-${template.active_version_id}`,
          template.name,
          {},
          {},
        );
      }
      // get the data
      // write the data to port
    });

  command
    .command("fetch-workspaces")
    .description("Get Coder workspaces")
    .action(async () => {
      logger.info("fetching workspaces");
      const resp = await getWorkspaces();
      for (const workspace of resp.workspaces) {
        await upsertEntity(
          "coder_workspace",
          workspace.id,
          workspace.name,
          {
            owner_id: workspace.owner_id,
            owner_name: workspace.owner_name,
            ttl_ms: workspace.ttl_ms,
            daily_cost: workspace.latest_build.daily_cost,
            organization_id: workspace.organization_id,
            organization_name: workspace.organization_name,
            healthy: workspace.health.healthy,
            latest_build_number: workspace.latest_build.build_number,
            automatic_updates: workspace.automatic_updates,
            autostart_schedule: workspace.autostart_schedule,
            created_at: workspace.created_at,
            deleting_at: workspace.deleting_at,
            dormant_at: workspace.dormant_at,
            updated_at: workspace.updated_at,
            last_used_at: workspace.last_used_at,
            next_start_at: workspace.next_start_at,
          },
          {
            template_id: workspace.template_id,
          },
        );
      }
      // get the data
      // write the data to port
    });

  command
    .command("create-workspace")
    .option("--name <workspace name>", "The name of the workspace")
    .option("--template <template id>", "The id of the template")
    .option(
      "--ttl <ttl in ms>",
      "The time to live for the workspace, in milliseconds",
    )
    .description("Create a Coder workspace for a given template")
    .action(async (options) => {
      logger.info("Creating a workspace");
      await createWorkspace(options.template, options.name, options.ttl);
      // get the data
      // write the data to port
    });
}
