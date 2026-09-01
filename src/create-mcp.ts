import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerCertTools } from "./certs.js";
import { registerCronTools } from "./cron.js";
import { registerDdnsTools } from "./ddns.js";
import { registerDockerTools } from "./docker.js";
import type { Env } from "./env.js";
import { registerFileServiceTools } from "./file-services.js";
import { registerIpFilterTools } from "./ip-filter.js";
import { runTool } from "./lib/mcp-result.js";
import { registerLogsCenterTools } from "./logs-center.js";
import { ALLOWED_PREFIXES, assertPathAllowed, type HttpMethod } from "./lucky/allowlist.js";
import type { LuckyHttp } from "./lucky/http.js";
import { registerObservabilityTools } from "./observability.js";
import { registerPortForwardTools } from "./port-forwards.js";
import { registerSecurityGroupTools } from "./security-groups.js";
import { registerSettingsTools } from "./settings.js";
import { registerStorageTools } from "./storage.js";
import { registerStunTools } from "./stun.js";
import { registerWebTools } from "./web-rules/tools.js";
import { registerWebTerminalTools } from "./web-terminal.js";
import { registerWolTools } from "./wol.js";

const jsonObject = z.record(z.string(), z.unknown());

export function createMcp(env: Env, http: LuckyHttp): McpServer {
  const server = new McpServer({
    name: "lucky-mcp-server",
    version: "0.1.3",
  });

  registerWebTools(server, env, http);
  registerCertTools(server, env, http);
  registerPortForwardTools(server, http);
  registerDdnsTools(server, http);
  registerStunTools(server, http);
  registerWolTools(server, http);
  registerCronTools(server, http);
  registerFileServiceTools(server, http);
  registerDockerTools(server, http);
  registerIpFilterTools(server, http);
  registerSecurityGroupTools(server, http);
  registerLogsCenterTools(server, http);
  registerStorageTools(server, http);
  registerObservabilityTools(server, http);
  registerWebTerminalTools(server, http);
  registerSettingsTools(server, http);

  server.registerTool(
    "lucky_api_catalog",
    {
      title: "List allowlisted Lucky API prefixes",
      description: "List Lucky API prefixes this MCP is willing to call via lucky_api_call.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ prefixes: ALLOWED_PREFIXES })),
  );

  server.registerTool(
    "lucky_api_call",
    {
      title: "Call an allowlisted Lucky API",
      description:
        "Escape hatch for allowlisted Lucky APIs. Login, admin password, OpenToken, 2FA, restore, reboot, OAuth login, and process kill are blocked. Prefer dedicated tools when one exists.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().startsWith("/"),
        query: jsonObject.optional(),
        body: z.unknown().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async (args) =>
      runTool(async () => {
        assertPathAllowed(args.method, args.path);
        return {
          result: await http.request({
            method: args.method as HttpMethod,
            path: args.path,
            query: args.query,
            body: args.body,
          }),
        };
      }),
  );

  return server;
}
