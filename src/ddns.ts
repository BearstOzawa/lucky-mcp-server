import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { getString, isRecord } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import {
  identity,
  loadByKey,
  loadList,
  setRecordEnabled,
  sliceLogs,
  type QueryResource,
} from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/ddnstasklist", "/api/ddns/expanded"],
  itemPath: "/api/ddns",
  getPath: "/api/ddns/task/{key}",
  enablePath: "/api/ddns/enable",
};

const PROVIDER_FIELDS = ["Provider", "DNSProvider", "Type", "provider"] as const;
const LAST_IP_FIELDS = ["Ipv4Addr", "LastIP", "CurrentIP", "IP", "lastIP"] as const;
const STATUS_FIELDS = ["Status", "LastStatus", "Msg", "message"] as const;

export interface CompactDdns {
  key: string;
  name: string;
  enable: boolean;
  provider: string;
  domains: string[];
  last_ip?: string;
  status?: string;
}

export function compactDdns(native: Record<string, unknown>): CompactDdns {
  const id = identity(native);
  const dns = isRecord(native.DNS) ? native.DNS : undefined;
  const records = Array.isArray(native.Records) ? native.Records.filter(isRecord) : [];
  const domainsRaw = native.Domains ?? native.Domain ?? native.hosts;
  const domainsFromRecords = records
    .map((item) => getString(item, ["Domain", "Host", "Name", "SubDomain"]))
    .filter((item): item is string => Boolean(item));
  const domains =
    typeof domainsRaw === "string"
      ? domainsRaw
          .split(/[,\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : Array.isArray(domainsRaw)
        ? domainsRaw.map((item) => String(item))
        : domainsFromRecords;
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    provider: getString(native, PROVIDER_FIELDS) ?? (dns ? getString(dns, ["Name"]) ?? "" : ""),
    domains,
    last_ip: getString(native, LAST_IP_FIELDS),
    status: getString(native, STATUS_FIELDS),
  };
}

export async function listDdns(http: LuckyHttp): Promise<CompactDdns[]> {
  return (await loadList(http, resource.listPaths)).map(compactDdns);
}

export async function getDdns(http: LuckyHttp, key: string): Promise<CompactDdns> {
  return compactDdns(await loadByKey(http, resource, key));
}

export function registerDdnsTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_ddns",
    {
      title: "List Lucky DDNS tasks",
      description:
        "List DDNS tasks in compact form (provider, domains, last IP). Provider secrets are redacted. Creating a new provider task is provider-specific; use lucky_api_call only if you already have a native payload.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ tasks: await listDdns(http) })),
  );

  server.registerTool(
    "lucky_get_ddns",
    {
      title: "Get a Lucky DDNS task",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => getDdns(http, args.key)),
  );

  server.registerTool(
    "lucky_set_ddns_enabled",
    {
      title: "Enable or disable a Lucky DDNS task",
      inputSchema: { key: z.string().min(1), enabled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => compactDdns(await setRecordEnabled(http, resource, args.key, args.enabled))),
  );

  server.registerTool(
    "lucky_sync_ddns",
    {
      title: "Trigger a Lucky DDNS sync",
      description: "Force one DDNS task to update now.",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => runTool(() => http.get(`/api/ddns/manualSync/${encodeURIComponent(args.key)}`)),
  );

  server.registerTool(
    "lucky_ddns_logs",
    {
      title: "Read Lucky DDNS logs",
      inputSchema: { limit: z.number().int().min(1).max(500).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        try {
          return sliceLogs(await http.get("/api/ddns/lastlogs"), args.limit ?? 50);
        } catch {
          return sliceLogs(await http.get("/api/ddns/logs"), args.limit ?? 50);
        }
      }),
  );
}
