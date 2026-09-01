import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./lib/mcp-result.js";
import { cloneJson, getNumber, getString, setField } from "./lib/object-fields.js";
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
  listPaths: ["/api/webterminal/connections"],
  itemPath: "/api/webterminal/connections",
  getPath: "/api/webterminal/connections/{key}",
};

const HOST_FIELDS = ["Host", "host", "Hostname"] as const;
const USER_FIELDS = ["User", "Username", "user"] as const;
const PORT_FIELDS = ["Port", "port"] as const;

export function compactConnection(native: Record<string, unknown>): {
  key: string;
  name: string;
  host: string;
  port: number;
  user: string;
} {
  const id = identity(native);
  return {
    key: id.key,
    name: id.name,
    host: getString(native, HOST_FIELDS) ?? "",
    port: getNumber(native, PORT_FIELDS) ?? 22,
    user: getString(native, USER_FIELDS) ?? "",
  };
}

export function registerWebTerminalTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_terminal_connections",
    {
      title: "List Lucky web-terminal connections and sessions",
      description: "Passwords and private keys are redacted. SFTP file operations are not exposed.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        connections: (await loadList(http, resource.listPaths)).map(compactConnection),
        sessions: await safeGet(http, "/api/webterminal/sessions"),
      })),
  );

  server.registerTool(
    "lucky_upsert_terminal_connection",
    {
      title: "Create or update a Lucky SSH connection",
      description: "Idempotent by name. Stores host/user/port; password is optional and will be redacted in responses.",
      inputSchema: {
        name: z.string().min(1),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        key: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(async () => {
        const existing = await loadList(http, resource.listPaths);
        const match = existing.find((item) => {
          const compact = compactConnection(item);
          return args.key ? compact.key === args.key : compact.name === args.name;
        });
        const native = match ? cloneJson(match) : { Key: newKey(existing), Enable: true };
        if (!match) {
          setField(native, KEY_FIELDS, native.Key ?? newKey(existing));
        }
        setField(native, NAME_FIELDS, args.name);
        setField(native, HOST_FIELDS, args.host);
        setField(native, PORT_FIELDS, args.port ?? 22);
        if (args.user) {
          setField(native, USER_FIELDS, args.user);
        }
        if (args.password) {
          setField(native, ["Password", "password"], args.password);
        }
        await saveRecord(http, resource, native, !match);
        return { action: match ? "updated" : "created", connection: compactConnection(native) };
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
