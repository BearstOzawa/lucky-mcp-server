import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LuckyError } from "./lib/errors.js";
import { runTool } from "./lib/mcp-result.js";
import { getString, setField } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import {
  KEY_FIELDS,
  NAME_FIELDS,
  identity,
  loadList,
  newKey,
  saveRecord,
  type QueryResource,
} from "./lucky/records.js";

const resource: QueryResource = {
  listPaths: ["/api/wol/devices_lite", "/api/wol/devices"],
  itemPath: "/api/wol/device",
};

const MAC_FIELDS = ["MAC", "Mac", "mac", "MacAddress", "MacAddr"] as const;
const BROADCAST_FIELDS = ["BroadcastIP", "Broadcast", "broadcast"] as const;

export interface CompactWolDevice {
  key: string;
  name: string;
  enable: boolean;
  mac: string;
  broadcast?: string;
}

export function compactWol(native: Record<string, unknown>): CompactWolDevice {
  const id = identity(native);
  return {
    key: id.key,
    name: id.name,
    enable: id.enable,
    mac: normalizeMac(getString(native, MAC_FIELDS) ?? ""),
    broadcast: getString(native, BROADCAST_FIELDS),
  };
}

export async function listWolDevices(http: LuckyHttp): Promise<CompactWolDevice[]> {
  return (await loadList(http, resource.listPaths)).map(compactWol);
}

export async function wakeDevice(
  http: LuckyHttp,
  input: { key?: string; name?: string; mac?: string },
): Promise<unknown> {
  const devices = await listWolDevices(http);
  const mac = input.mac ? normalizeMac(input.mac) : undefined;
  const match = devices.find((device) => {
    if (input.key && device.key === input.key) {
      return true;
    }
    if (input.name && device.name.toLowerCase() === input.name.toLowerCase()) {
      return true;
    }
    if (mac && device.mac === mac) {
      return true;
    }
    return false;
  });
  if (!match && !mac) {
    throw new LuckyError("WOL device not found. Pass key, name, or mac.", "not_found");
  }
  return http.get("/api/wol/device/wakeup", {
    key: match?.key,
    mac: match?.mac ?? mac,
  });
}

export async function addWolDevice(
  http: LuckyHttp,
  input: { name: string; mac: string; broadcast?: string },
): Promise<CompactWolDevice> {
  const existing = await loadList(http, ["/api/wol/devices", ...resource.listPaths]);
  const mac = normalizeMac(input.mac);
  const duplicate = existing.find((item) => compactWol(item).mac === mac);
  if (duplicate) {
    return compactWol(duplicate);
  }
  const native: Record<string, unknown> = {
    Key: newKey(existing),
    Name: input.name,
    Enable: true,
    MAC: mac,
  };
  setField(native, NAME_FIELDS, input.name);
  setField(native, MAC_FIELDS, mac);
  if (input.broadcast) {
    setField(native, BROADCAST_FIELDS, input.broadcast);
  }
  setField(native, KEY_FIELDS, native.Key);
  await saveRecord(http, resource, native, true);
  return compactWol(native);
}

export function registerWolTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_wol_devices",
    {
      title: "List Lucky WOL devices",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ devices: await listWolDevices(http) })),
  );

  server.registerTool(
    "lucky_wake",
    {
      title: "Wake a device through Lucky",
      description: "Send a Wake-on-LAN packet. Identify the device by key, name, or MAC.",
      inputSchema: {
        key: z.string().optional(),
        name: z.string().optional(),
        mac: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => runTool(() => wakeDevice(http, args)),
  );

  server.registerTool(
    "lucky_add_wol_device",
    {
      title: "Add a Lucky WOL device",
      inputSchema: {
        name: z.string().min(1),
        mac: z.string().min(1),
        broadcast: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        addWolDevice(http, {
          name: args.name,
          mac: args.mac,
          broadcast: args.broadcast,
        }),
      ),
  );
}

function normalizeMac(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) {
    return value.trim().toLowerCase();
  }
  return hex.match(/.{2}/g)?.join(":") ?? value;
}
