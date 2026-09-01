import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { cloneJson, getString, getStringArray, setField } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import {
  ENABLE_FIELDS,
  NAME_FIELDS,
  deleteRecord,
  findByName,
  identity,
  loadList,
  readNumber,
  saveRecord,
  setRecordEnabled,
  sliceLogs,
  type QueryResource,
} from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/portforwards", "/api/portforwards_lite"],
  itemPath: "/api/portforward",
  getPath: "/api/portforward/{key}",
  enablePath: "/api/portforward/enable",
};

const LISTEN_PORT_FIELDS = ["ListenPort", "listenPort"] as const;
const LISTEN_PORTS_FIELDS = ["ListenPorts", "listenPorts"] as const;
const LISTEN_IP_FIELDS = ["ListenAddress", "ListenIP", "ListenHost", "listenIP"] as const;
const TARGET_IP_FIELDS = ["TargetIP", "ToIP", "targetIP", "DestIP"] as const;
const TARGET_ADDR_FIELDS = ["TargetAddressList", "targetAddressList"] as const;
const TARGET_PORT_FIELDS = ["TargetPort", "ToPort", "targetPort", "DestPort"] as const;
const TARGET_PORTS_FIELDS = ["TargetPorts", "targetPorts"] as const;
const PROTOCOL_FIELDS = ["Protocol", "protocol", "Type"] as const;

export interface CompactPortForward {
  key: string;
  name: string;
  enable: boolean;
  listen_ip: string;
  listen_port: number;
  target_ip: string;
  target_port: number;
  protocol: string;
}

export interface UpsertPortForwardInput {
  name?: string;
  listenPort: number;
  targetIp: string;
  targetPort: number;
  listenIp?: string;
  protocol?: string;
  enabled?: boolean;
  key?: string;
}

export function compactPortForward(native: Record<string, unknown>): CompactPortForward {
  const id = identity(native);
  const targetAddrs = getStringArray(native, TARGET_ADDR_FIELDS);
  const forwardTypes = Array.isArray(native.ForwardTypes)
    ? native.ForwardTypes.map((item) => String(item))
    : [];
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    listen_ip: getString(native, LISTEN_IP_FIELDS) ?? "0.0.0.0",
    listen_port: firstPort(getString(native, LISTEN_PORTS_FIELDS)) || readNumber(native, LISTEN_PORT_FIELDS),
    target_ip: targetAddrs[0] ?? getString(native, TARGET_IP_FIELDS) ?? "",
    target_port: firstPort(getString(native, TARGET_PORTS_FIELDS)) || readNumber(native, TARGET_PORT_FIELDS),
    protocol: normalizeProtocol(forwardTypes[0] ?? getString(native, PROTOCOL_FIELDS) ?? "tcp"),
  };
}

export async function listPortForwards(http: LuckyHttp): Promise<CompactPortForward[]> {
  return (await loadList(http, resource.listPaths)).map(compactPortForward);
}

export async function upsertPortForward(http: LuckyHttp, input: UpsertPortForwardInput): Promise<{
  action: "created" | "updated";
  forward: CompactPortForward;
}> {
  const protocol = normalizeProtocol(input.protocol ?? "tcp");
  const existing = await loadList(http, ["/api/portforwards", ...resource.listPaths]);
  const match = existing.find((item) => {
    const compact = compactPortForward(item);
    if (input.key) {
      return compact.key === input.key;
    }
    if (input.name && compact.name === input.name) {
      return true;
    }
    return compact.listen_port === input.listenPort && compact.protocol === protocol;
  });

  if (match) {
    const next = cloneJson(match);
    applyPortForward(next, input, protocol);
    await saveRecord(http, resource, next, false);
    const reloaded = (await findByName(http, resource, next.Name ? String(next.Name) : input.name ?? "")) ?? next;
    return { action: "updated", forward: compactPortForward(identity(reloaded).key ? reloaded : next) };
  }

  const created = matchTemplate();
  applyPortForward(created, input, protocol);
  const posted = await saveRecord(http, resource, created, true);
  const named = input.name ? await findByName(http, resource, input.name) : undefined;
  const resolved =
    (named && identity(named).key ? named : undefined) ??
    (isRecordPosted(posted) ? posted : created);
  return { action: "created", forward: compactPortForward(resolved) };
}

function isRecordPosted(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function deletePortForward(http: LuckyHttp, key: string): Promise<unknown> {
  return deleteRecord(http, resource, key);
}

export async function setPortForwardEnabled(http: LuckyHttp, key: string, enabled: boolean): Promise<CompactPortForward> {
  return compactPortForward(await setRecordEnabled(http, resource, key, enabled));
}

export async function portForwardLogs(http: LuckyHttp, key: string, limit = 50): Promise<unknown> {
  try {
    return sliceLogs(await http.get(`/api/portforward/${encodeURIComponent(key)}/logs`), limit);
  } catch {
    return sliceLogs(await http.get(`/api/portforward/${encodeURIComponent(key)}/lastlogs`), limit);
  }
}

export function registerPortForwardTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_port_forwards",
    {
      title: "List Lucky port forwards",
      description: "List port-forward rules in compact form (listen port, target, protocol).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ forwards: await listPortForwards(http) })),
  );

  server.registerTool(
    "lucky_upsert_port_forward",
    {
      title: "Create or update a Lucky port forward",
      description:
        "Idempotently map an external listen port to an internal ip:port. Matching is by listen_port + protocol unless key is provided. Does not send Lucky's full native object.",
      inputSchema: {
        name: z.string().optional(),
        listen_port: z.number().int().min(1).max(65535),
        target_ip: z.string().min(1),
        target_port: z.number().int().min(1).max(65535),
        listen_ip: z.string().optional(),
        protocol: z.enum(["tcp", "udp", "tcp+udp"]).optional(),
        enabled: z.boolean().optional(),
        key: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        upsertPortForward(http, {
          name: args.name,
          listenPort: args.listen_port,
          targetIp: args.target_ip,
          targetPort: args.target_port,
          listenIp: args.listen_ip,
          protocol: args.protocol,
          enabled: args.enabled,
          key: args.key,
        }),
      ),
  );

  server.registerTool(
    "lucky_delete_port_forward",
    {
      title: "Delete a Lucky port forward",
      description: "Delete a port-forward rule by key.",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) => runTool(() => deletePortForward(http, args.key)),
  );

  server.registerTool(
    "lucky_set_port_forward_enabled",
    {
      title: "Enable or disable a Lucky port forward",
      inputSchema: { key: z.string().min(1), enabled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => setPortForwardEnabled(http, args.key, args.enabled)),
  );

  server.registerTool(
    "lucky_port_forward_logs",
    {
      title: "Read Lucky port-forward logs",
      inputSchema: {
        key: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => portForwardLogs(http, args.key, args.limit)),
  );
}

function applyPortForward(native: Record<string, unknown>, input: UpsertPortForwardInput, protocol: string): void {
  if (input.name) {
    setField(native, NAME_FIELDS, input.name);
  }
  setField(native, LISTEN_IP_FIELDS, input.listenIp ?? getString(native, LISTEN_IP_FIELDS) ?? "0.0.0.0");
  setField(native, LISTEN_PORTS_FIELDS, String(input.listenPort));
  setField(native, TARGET_ADDR_FIELDS, [input.targetIp]);
  setField(native, TARGET_PORTS_FIELDS, String(input.targetPort));
  native.ForwardTypes = [protocol];
  setField(native, ENABLE_FIELDS, input.enabled ?? true);
}

function matchTemplate(): Record<string, unknown> {
  return {
    Name: "",
    Enable: false,
    ListenAddress: "0.0.0.0",
    ListenPorts: "",
    TargetAddressList: [],
    TargetPorts: "",
    ForwardTypes: ["tcp"],
  };
}

function firstPort(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function normalizeProtocol(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "udp") {
    return "udp";
  }
  if (normalized === "tcp+udp" || normalized === "tcpudp" || normalized === "both" || normalized === "all") {
    return "tcp+udp";
  }
  return "tcp";
}


