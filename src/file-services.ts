import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isRecord } from "./lib/object-fields.js";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";
import { sliceLogs } from "./lucky/records.js";

export function registerFileServiceTools(server: McpServer, http: LuckyHttp): void {
  registerOne(server, http, {
    id: "ftp",
    title: "FTP",
    configure: "/api/ftpserver/configure",
    status: "/api/ftpserver/status",
    logs: "/api/ftpserver/lastlogs",
    logsFallback: "/api/ftpserver/logs",
  });
  registerOne(server, http, {
    id: "webdav",
    title: "WebDAV",
    configure: "/api/webdav/configure",
    status: "/api/webdav/status",
    logs: "/api/webdav/lastlogs",
    logsFallback: "/api/webdav/logs",
  });
}

function registerOne(
  server: McpServer,
  http: LuckyHttp,
  spec: { id: "ftp" | "webdav"; title: string; configure: string; status: string; logs: string; logsFallback: string },
): void {
  server.registerTool(
    `lucky_get_${spec.id}`,
    {
      title: `Read Lucky ${spec.title} config and status`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        configure: await http.get(spec.configure),
        status: await safeGet(http, spec.status),
      })),
  );

  server.registerTool(
    `lucky_update_${spec.id}`,
    {
      title: `Update Lucky ${spec.title} config`,
      description: `Merge a partial patch into the ${spec.title} configure object. Secrets in the response are redacted.`,
      inputSchema: { patch: z.record(z.string(), z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        const current = await http.get(spec.configure);
        const merged =
          isRecord(current) && isRecord(args.patch) ? { ...current, ...args.patch } : args.patch;
        return http.put(spec.configure, merged);
      }),
  );

  server.registerTool(
    `lucky_${spec.id}_logs`,
    {
      title: `Read Lucky ${spec.title} logs`,
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        try {
          return sliceLogs(await http.get(spec.logs), args.limit ?? 50);
        } catch {
          return sliceLogs(await http.get(spec.logsFallback), args.limit ?? 50);
        }
      }),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return null;
  }
}
