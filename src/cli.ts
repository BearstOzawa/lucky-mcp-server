#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcp } from "./create-mcp.js";
import { loadEnv } from "./env.js";
import { LuckyHttp } from "./lucky/http.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const http = new LuckyHttp(env);
  const server = createMcp(env, http);
  await server.connect(new StdioServerTransport());
  if (env.debug) {
    console.error("lucky-mcp-server 0.1.3 running on stdio");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[lucky-mcp:error] ${message}`);
  process.exit(1);
});
