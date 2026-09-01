import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";

export function registerSettingsTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_get_settings",
    {
      title: "Read Lucky base settings",
      description:
        "Read Lucky base settings. Passwords, OpenToken, and other secrets are redacted. Updating admin account, password, or OpenToken is not available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(() => http.get("/api/baseconfigure")),
  );
}
