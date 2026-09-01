import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";
import { LuckyHttp } from "../src/lucky/http.js";
import {
  exposeService,
  listWebRules,
  readStatus,
  readWebLogs,
  unexposeService,
} from "../src/web-rules/operations.js";
import { startFakeLucky, type FakeLucky } from "./fake-lucky.js";

const fakes: FakeLucky[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
});

describe("operations against a fake Lucky 3.0 API", () => {
  it("lists compact rules and exposes a new hostname onto the TLS listener", async () => {
    const { env, http, fake } = await boot();
    const listed = await listWebRules(http);
    expect(listed.map((rule) => rule.listenPort).sort((a, b) => a - b)).toEqual([80, 16666]);

    const created = await exposeService(http, env, {
      domain: "https://Outline.example.com",
      backend: "127.0.0.1:3001",
      name: "outline",
    });
    expect(created.action).toBe("created");
    expect(created.public_url).toBe("https://outline.example.com:16666");
    expect(created.rule.listen_port).toBe(16666);
    expect(created.route.backend).toBe("http://127.0.0.1:3001");
    expect(fake.lastOpenToken).toBe("test-token");
    expect(fake.lastUrl).toContain("/api/webservice/rule/listener-https");

    const updated = await exposeService(http, env, {
      domain: "outline.example.com",
      backend: "http://127.0.0.1:3002",
    });
    expect(updated.action).toBe("updated");
    expect(updated.route.backend).toBe("http://127.0.0.1:3002");

    const after = await listWebRules(http);
    const https = after.find((rule) => rule.key === "listener-https");
    expect(https?.routes.map((route) => route.domains[0])).toEqual([
      "wiki.example.com",
      "old.example.com",
      "outline.example.com",
    ]);
  });

  it("honors listen_port and domain suffix policy", async () => {
    const { http } = await boot({ LUCKY_ALLOWED_DOMAIN_SUFFIX: "example.com" });
    const env = loadEnv({
      LUCKY_BASE_URL: http.baseUrl.origin,
      LUCKY_OPEN_TOKEN: "test-token",
      LUCKY_ALLOWED_DOMAIN_SUFFIX: "example.com",
    });
    await expect(
      exposeService(http, env, { domain: "evil.test", backend: "http://127.0.0.1:1" }),
    ).rejects.toThrow(/not allowed/);

    const result = await exposeService(http, env, {
      domain: "alt.example.com",
      backend: "http://127.0.0.1:9",
      listenPort: 80,
    });
    expect(result.rule.listen_port).toBe(80);
    expect(result.public_url).toBe("http://alt.example.com");
  });

  it("unexposes a hostname and reads logs", async () => {
    const { env, http } = await boot();
    const removed = await unexposeService(http, env, { domain: "wiki.example.com" });
    expect(removed.action).toBe("removed");
    const missing = await unexposeService(http, env, { domain: "wiki.example.com" });
    expect(missing.action).toBe("missing");

    const logs = await readWebLogs(http, { domain: "old.example.com" });
    expect(logs).toEqual(["GET listener-https/route-redirect 200", "backend ok"]);
  });

  it("reports status without echoing the OpenToken", async () => {
    const { env, http } = await boot();
    const status = (await readStatus(http, env)) as {
      lucky: { version: { version: string } };
      mcp: { base_url: string };
    };
    expect(status.lucky.version.version).toBe("3.0.0");
    expect(JSON.stringify(status)).not.toContain("test-token");
  });
});

async function boot(extra: Record<string, string> = {}) {
  const fake = await startFakeLucky();
  fakes.push(fake);
  const env = loadEnv({
    LUCKY_BASE_URL: fake.baseUrl,
    LUCKY_OPEN_TOKEN: "test-token",
    ...extra,
  });
  return { fake, env, http: new LuckyHttp(env) };
}
