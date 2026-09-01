import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";
import { identity, loadList, setRecordEnabled, type QueryResource } from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/storagemanagement/litelist", "/api/storagemanagement/list"],
  itemPath: "/api/storagemanagement/list",
  enablePath: "/api/storagemanagement/enable",
};

export function registerStorageTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_storage",
    {
      title: "List Lucky storage mounts",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        mounts: (await loadList(http, resource.listPaths)).map(identity),
        rclone: await safeGet(http, "/api/rclone/remotelistlite"),
      })),
  );

  server.registerTool(
    "lucky_set_storage_enabled",
    {
      title: "Enable or disable a Lucky storage mount",
      inputSchema: { key: z.string().min(1), enabled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => identity(await setRecordEnabled(http, resource, args.key, args.enabled))),
  );

  server.registerTool(
    "lucky_list_local_paths",
    {
      title: "Browse Lucky local paths",
      description: "List filesystem roots, or files under a path, as Lucky sees them.",
      inputSchema: { path: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        if (!args.path) {
          return http.get("/api/local-path-browser/roots");
        }
        return http.get("/api/local-path-browser/list", { path: args.path });
      }),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return [];
  }
}
