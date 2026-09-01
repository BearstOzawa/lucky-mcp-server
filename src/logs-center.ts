import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";

export function registerLogsCenterTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_logs_stats",
    {
      title: "Lucky logs-center stats and locations",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        stats: await safeGet(http, "/api/logscenter/stats"),
        locations: await safeGet(http, "/api/logscenter/locations"),
        streams: await safeGet(http, "/api/logscenter/streams"),
        config: await safeGet(http, "/api/logscenter/config"),
      })),
  );

  server.registerTool(
    "lucky_query_logs",
    {
      title: "Query Lucky logs-center",
      description: "Query centralized logs. Pass Lucky's native query object; common fields are search, limit, and location.",
      inputSchema: {
        query: z.record(z.string(), z.unknown()).optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        http.get("/api/logscenter/query", {
          ...args.query,
          search: args.search,
          limit: args.limit ?? 100,
        }),
      ),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return null;
  }
}
