import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";

export function registerObservabilityTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_host_status",
    {
      title: "Lucky host and module status",
      description: "Host overview, connections, processes, module overview, and network interfaces. Process kill is not available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        overview: await safeGet(http, "/api/status/host-overview"),
        modules: await safeGet(http, "/api/status/module-overview"),
        connections: await safeGet(http, "/api/status/host-connections"),
        processes: await safeGet(http, "/api/status/host-processes"),
        interfaces: await safeGet(http, "/api/netinterfaces"),
      })),
  );

  server.registerTool(
    "lucky_list_tunnels",
    {
      title: "List Lucky tunnels and WAF instances",
      description: "Cloudflared tunnels plus Coraza WAF instances.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        cloudflared: await safeGet(http, "/api/cloudflared/list"),
        coraza: await safeGet(http, "/api/coraza/instancelist"),
      })),
  );

  server.registerTool(
    "lucky_query_ip",
    {
      title: "Query Lucky IP database",
      inputSchema: { ip: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => http.get("/api/ipdb/query", { ip: args.ip })),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return null;
  }
}
