import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "./lib/mcp-result.js";
import type { LuckyHttp } from "./lucky/http.js";

export function registerDockerTools(server: McpServer, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_docker",
    {
      title: "List Lucky Docker resources",
      description: "List Docker containers, images, volumes, and compose projects visible to Lucky. Read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool(async () => ({
        containers: await safeGet(http, "/api/docker/containers"),
        images: await safeGet(http, "/api/docker/images"),
        volumes: await safeGet(http, "/api/docker/volumes"),
        compose_projects: await safeGet(http, "/api/docker/compose/projects"),
        container_groups: await safeGet(http, "/api/docker/container-groups"),
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
