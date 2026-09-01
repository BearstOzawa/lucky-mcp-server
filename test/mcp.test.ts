import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcp } from "../src/create-mcp.js";
import { loadEnv } from "../src/env.js";
import { LuckyHttp } from "../src/lucky/http.js";
import { startFakeLucky } from "./fake-lucky.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("MCP tools", () => {
  it("lists workflow tools and can expose a service", async () => {
    const fake = await startFakeLucky();
    closers.push(() => fake.close());
    const env = loadEnv({
      LUCKY_BASE_URL: fake.baseUrl,
      LUCKY_OPEN_TOKEN: "test-token",
    });
    const server = createMcp(env, new LuckyHttp(env));
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    closers.push(
      () => client.close(),
      () => server.close(),
    );

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    for (const name of [
      "lucky_status",
      "lucky_expose_service",
      "lucky_list_certs",
      "lucky_bind_cert",
      "lucky_upsert_port_forward",
      "lucky_list_ddns",
      "lucky_wake",
      "lucky_list_cron_jobs",
      "lucky_get_ftp",
      "lucky_list_docker",
      "lucky_list_ip_filters",
      "lucky_host_status",
      "lucky_get_settings",
      "lucky_api_call",
    ]) {
      expect(names).toContain(name);
    }

    const exposed = await client.callTool({
      name: "lucky_expose_service",
      arguments: {
        domain: "n8n.example.com",
        backend: "http://127.0.0.1:5678",
        name: "n8n",
      },
    });
    expect(exposed.isError).not.toBe(true);
    const body = JSON.parse(String(exposed.content[0] && "text" in exposed.content[0] ? exposed.content[0].text : "{}"));
    expect(body.action).toBe("created");
    expect(body.public_url).toBe("https://n8n.example.com:16666");
  });
});
