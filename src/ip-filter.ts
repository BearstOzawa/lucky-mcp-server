import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { getString } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import { identity, loadList, sliceLogs } from "./lucky/records.js";

export function compactFilter(native: Record<string, unknown>): {
  key: string;
  name: string;
  enable: boolean;
  mode?: string;
} {
  const id = identity(native);
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    mode: getString(native, ["Mode", "Type", "SafeIPMode", "mode"]),
  };
}

export function registerIpFilterTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_ip_filters",
    {
      title: "List Lucky IP filter rules",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        rules: (await loadList(http, ["/api/ipfliter/listlite", "/api/ipfliter/list"])).map(compactFilter),
      })),
  );

  server.registerTool(
    "lucky_get_ip_filter",
    {
      title: "Get one Lucky IP filter list",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => http.get(`/api/ipfliter/list/${encodeURIComponent(args.key)}`)),
  );

  server.registerTool(
    "lucky_list_blocked_ips",
    {
      title: "List Lucky port-trap blocked IPs",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        blocked: await http.get("/api/ipfliter/porttrap/blockedips"),
        stats: await safeGet(http, "/api/ipfliter/porttrap/stats"),
      })),
  );

  server.registerTool(
    "lucky_unblock_ip",
    {
      title: "Unblock an IP from Lucky port-trap",
      inputSchema: { ip: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) =>
      runTool(() => http.delete(`/api/ipfliter/porttrap/blockedips/${encodeURIComponent(args.ip)}`)),
  );

  server.registerTool(
    "lucky_ip_filter_logs",
    {
      title: "Read Lucky IP filter / port-trap logs",
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => sliceLogs(await http.get("/api/ipfliter/porttrap/logs"), args.limit ?? 50)),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return null;
  }
}
