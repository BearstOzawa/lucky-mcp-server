import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { getString } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import {
  identity,
  loadList,
  readNumber,
  setRecordEnabled,
  sliceLogs,
  type QueryResource,
} from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/stunrulelist_lite", "/api/stunrulelist"],
  itemPath: "/api/stunrule",
  getPath: "/api/stun/{key}",
  enablePath: "/api/stunrule/enable",
};

export interface CompactStun {
  key: string;
  name: string;
  enable: boolean;
  listen_port?: number;
  public_addr?: string;
}

export function compactStun(native: Record<string, unknown>): CompactStun {
  const id = identity(native);
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    listen_port: readNumber(native, ["StunLocalPort", "ListenPort", "listenPort", "Port"], 0) || undefined,
    public_addr:
      getString(native, ["PublicAddr", "MappedAddr", "StunAddr", "publicAddr"]) ?? undefined,
  };
}

export async function listStunRules(http: LuckyHttp): Promise<CompactStun[]> {
  return (await loadList(http, resource.listPaths)).map(compactStun);
}

export function registerStunTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_stun_rules",
    {
      title: "List Lucky STUN rules",
      description: "List STUN/NAT mapping rules (name, listen port, public address when known).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ rules: await listStunRules(http) })),
  );

  server.registerTool(
    "lucky_set_stun_enabled",
    {
      title: "Enable or disable a Lucky STUN rule",
      inputSchema: { key: z.string().min(1), enabled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => compactStun(await setRecordEnabled(http, resource, args.key, args.enabled))),
  );

  server.registerTool(
    "lucky_stun_logs",
    {
      title: "Read Lucky STUN logs",
      inputSchema: {
        key: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        try {
          return sliceLogs(
            await http.get(`/api/stun/${encodeURIComponent(args.key)}/logs`),
            args.limit ?? 50,
          );
        } catch {
          return sliceLogs(
            await http.get(`/api/stun/${encodeURIComponent(args.key)}/lastlogs`),
            args.limit ?? 50,
          );
        }
      }),
  );
}
