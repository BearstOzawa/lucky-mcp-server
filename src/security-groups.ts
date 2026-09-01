import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";
import { identity, loadList } from "./lucky/records.js";

export function registerSecurityGroupTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_security_groups",
    {
      title: "List Lucky security groups",
      description: "List security groups, grants, and users. Passwords are redacted. Creating users with passwords is not exposed as a dedicated tool.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        groups: (await loadList(http, ["/api/security-groups/lite", "/api/security-groups"])).map(identity),
        grants: await safeGet(http, "/api/security-groups/grants"),
        users: await safeGet(http, "/api/security-groups/users"),
        oauth_users: await safeGet(http, "/api/security-groups/oauth-users"),
      })),
  );

  server.registerTool(
    "lucky_list_auth_providers",
    {
      title: "List Lucky third-party auth providers",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        config: await safeGet(http, "/api/thirdPartyAuthManager/config"),
        providers: await safeGet(http, "/api/thirdPartyAuthManager/list"),
        oauth: await safeGet(http, "/api/oauth/status"),
      })),
  );
}

async function safeGet(http: LuckyHttp, path: string): Promise<unknown> {
  try {
    return await http.get(path);
  } catch {
    return [];
  }
}
