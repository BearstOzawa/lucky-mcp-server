import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../env.js";
import { runTool } from "../lib/mcp-result.js";
import type { LuckyHttp } from "../lucky/http.js";
import {
  exposeService,
  getWebRule,
  listWebRules,
  readStatus,
  readWebLogs,
  setDomainEnabled,
  unexposeService,
} from "./operations.js";

export function registerWebTools(server: McpServer, env: Env, http: LuckyHttp): void {
  server.registerTool(
    "lucky_status",
    {
      title: "Lucky status",
      description:
        "Probe Lucky connectivity, version, modules, and MCP settings. OpenToken is never returned.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(() => readStatus(http, env)),
  );

  server.registerTool(
    "lucky_list_web_rules",
    {
      title: "List Lucky reverse-proxy rules",
      description:
        "List Lucky web listeners and their reverse-proxy routes in compact form (port, TLS, domains, backends). Use this before exposing a service.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ rules: await listWebRules(http) })),
  );

  server.registerTool(
    "lucky_get_web_rule",
    {
      title: "Get one Lucky web rule",
      description: "Get a compact view of one Lucky web listener and its routes by rule key.",
      inputSchema: {
        rule_key: z.string().min(1).describe("Lucky web listener key"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => getWebRule(http, args.rule_key)),
  );

  server.registerTool(
    "lucky_expose_service",
    {
      title: "Expose a service through Lucky",
      description:
        "Idempotently attach a hostname to an existing Lucky HTTPS/HTTP listener and reverse-proxy it to a backend URL. Reuses the current TLS listener; does not create a new listen port. Domain should be a hostname without http://. Backend should be a full URL such as http://127.0.0.1:3000. If the domain already exists, only the backend (and optional name/auth) is updated.",
      inputSchema: {
        domain: z.string().min(1).describe("Public hostname, without http://"),
        backend: z.string().min(1).describe("Origin URL, e.g. http://127.0.0.1:3000"),
        name: z.string().optional().describe("Route remark shown in Lucky"),
        rule_key: z.string().optional().describe("Target listener key; omit to auto-select"),
        listen_port: z.number().int().positive().optional().describe("Target listener port"),
        enabled: z.boolean().optional().describe("Whether the route is enabled. Default true"),
        basic_auth_user: z.string().optional(),
        basic_auth_password: z.string().optional(),
        insecure_backend_tls: z
          .boolean()
          .optional()
          .describe("Skip TLS verification when the backend is HTTPS with a self-signed cert"),
        http_client_timeout: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Lucky HttpClientTimeout in seconds for this reverse-proxy route"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        exposeService(http, env, {
          domain: args.domain,
          backend: args.backend,
          name: args.name,
          ruleKey: args.rule_key,
          listenPort: args.listen_port,
          enabled: args.enabled,
          basicAuthUser: args.basic_auth_user,
          basicAuthPassword: args.basic_auth_password,
          insecureBackendTls: args.insecure_backend_tls,
          httpClientTimeout: args.http_client_timeout,
        }),
      ),
  );

  server.registerTool(
    "lucky_unexpose_service",
    {
      title: "Remove a Lucky reverse-proxy hostname",
      description:
        "Remove the reverse-proxy route for a hostname from its Lucky listener. The listener itself is not deleted.",
      inputSchema: {
        domain: z.string().min(1),
        rule_key: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        unexposeService(http, env, {
          domain: args.domain,
          ruleKey: args.rule_key,
        }),
      ),
  );

  server.registerTool(
    "lucky_set_route_enabled",
    {
      title: "Enable or disable a Lucky route",
      description: "Enable or disable the reverse-proxy route for a hostname without deleting it.",
      inputSchema: {
        domain: z.string().min(1),
        enabled: z.boolean(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => setDomainEnabled(http, { domain: args.domain, enabled: args.enabled })),
  );

  server.registerTool(
    "lucky_web_logs",
    {
      title: "Read Lucky reverse-proxy logs",
      description: "Read recent access logs for a hostname, a route, or the whole web module. Useful for 502 debugging.",
      inputSchema: {
        domain: z.string().optional(),
        rule_key: z.string().optional(),
        route_key: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        readWebLogs(http, {
          domain: args.domain,
          ruleKey: args.rule_key,
          routeKey: args.route_key,
          limit: args.limit,
        }),
      ),
  );
}
