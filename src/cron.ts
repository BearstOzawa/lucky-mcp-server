import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { cloneJson, getString, setField } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import {
  ENABLE_FIELDS,
  NAME_FIELDS,
  deleteRecord,
  findByName,
  identity,
  loadList,
  saveRecord,
  setRecordEnabled,
  sliceLogs,
  type QueryResource,
} from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/cron/list"],
  itemPath: "/api/cron/list",
  enablePath: "/api/cron/enable",
};

const EXPR_FIELDS = ["TypeParams", "CronExpr", "Expr", "Expression", "Spec", "cron"] as const;
const COMMAND_FIELDS = ["Command", "Cmd", "Script", "URL", "command"] as const;

export interface CompactCron {
  key: string;
  name: string;
  enable: boolean;
  expression: string;
  command: string;
  type: string;
}

export function compactCron(native: Record<string, unknown>): CompactCron {
  const id = identity(native);
  const jobs = Array.isArray(native.Jobs) ? native.Jobs : [];
  const firstJob = jobs[0] && typeof jobs[0] === "object" ? (jobs[0] as Record<string, unknown>) : undefined;
  const options =
    firstJob && firstJob.Options && typeof firstJob.Options === "object"
      ? (firstJob.Options as Record<string, unknown>)
      : undefined;
  const command =
    (options && typeof options.shell_content === "string" ? options.shell_content : undefined) ??
    getString(native, COMMAND_FIELDS) ??
    "";
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    expression: getString(native, EXPR_FIELDS) ?? "",
    command,
    type: String(native.Type ?? ""),
  };
}

export async function listCronJobs(http: LuckyHttp): Promise<CompactCron[]> {
  return (await loadList(http, resource.listPaths)).map(compactCron);
}

export async function upsertCronJob(
  http: LuckyHttp,
  input: { name: string; expression: string; command: string; type?: string; enabled?: boolean; key?: string },
): Promise<{ action: "created" | "updated"; job: CompactCron }> {
  const existing = await loadList(http, resource.listPaths);
  const match = existing.find((item) => {
    const compact = compactCron(item);
    return input.key ? compact.key === input.key : compact.name === input.name;
  });
  if (match) {
    const next = cloneJson(match);
    applyCron(next, input);
    await saveRecord(http, resource, next, false);
    const reloaded = (await findByName(http, resource, input.name)) ?? next;
    return { action: "updated", job: compactCron(reloaded) };
  }
  const created = minimalCron();
  applyCron(created, input);
  await saveRecord(http, resource, created, true);
  const reloaded = await findByName(http, resource, input.name);
  if (!reloaded) {
    throw new Error(`Lucky cron job was created but could not be reloaded: ${input.name}`);
  }
  return { action: "created", job: compactCron(reloaded) };
}

export function registerCronTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_cron_jobs",
    {
      title: "List Lucky cron jobs",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ jobs: await listCronJobs(http) })),
  );

  server.registerTool(
    "lucky_upsert_cron_job",
    {
      title: "Create or update a Lucky cron job",
      description: "Idempotent by name (or key). expression is a cron spec; command is the shell/http payload Lucky should run.",
      inputSchema: {
        name: z.string().min(1),
        expression: z.string().min(1),
        command: z.string().min(1),
        type: z.string().optional(),
        enabled: z.boolean().optional(),
        key: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => upsertCronJob(http, args)),
  );

  server.registerTool(
    "lucky_delete_cron_job",
    {
      title: "Delete a Lucky cron job",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) => runTool(() => deleteRecord(http, resource, args.key)),
  );

  server.registerTool(
    "lucky_set_cron_enabled",
    {
      title: "Enable or disable a Lucky cron job",
      inputSchema: { key: z.string().min(1), enabled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => compactCron(await setRecordEnabled(http, resource, args.key, args.enabled))),
  );

  server.registerTool(
    "lucky_run_cron_job",
    {
      title: "Run a Lucky cron job now",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) =>
      runTool(async () => {
        try {
          return await http.post("/api/cron/jobs/trigger", { key: args.key });
        } catch {
          return http.get("/api/cron/dojobs", { key: args.key });
        }
      }),
  );

  server.registerTool(
    "lucky_cron_logs",
    {
      title: "Read Lucky cron logs",
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        try {
          return sliceLogs(await http.get("/api/cron/lastlogs"), args.limit ?? 50);
        } catch {
          return sliceLogs(await http.get("/api/cron/logs"), args.limit ?? 50);
        }
      }),
  );
}

function applyCron(
  native: Record<string, unknown>,
  input: { name: string; expression: string; command: string; type?: string; enabled?: boolean },
): void {
  setField(native, NAME_FIELDS, input.name);
  native.Type = 7;
  native.TypeParams = input.expression;
  native.Jobs = [
    {
      Type: "shell_option",
      Remark: input.name,
      Options: { shell_content: input.command },
    },
  ];
  setField(native, ENABLE_FIELDS, input.enabled ?? false);
}

function minimalCron(): Record<string, unknown> {
  return {
    Name: "",
    Enable: false,
    Type: 7,
    TypeParams: "",
    Jobs: [],
  };
}
