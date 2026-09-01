import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

describe("loadEnv", () => {
  it("requires base URL and OpenToken", () => {
    expect(() => loadEnv({})).toThrow(/LUCKY_BASE_URL/);
    expect(() => loadEnv({ LUCKY_BASE_URL: "http://127.0.0.1:16601" })).toThrow(/LUCKY_OPEN_TOKEN/);
  });

  it("parses optional policy flags", () => {
    const env = loadEnv({
      LUCKY_BASE_URL: "http://127.0.0.1:16601/",
      LUCKY_OPEN_TOKEN: "token",
      LUCKY_TLS_VERIFY: "false",
      LUCKY_DEFAULT_LISTEN_PORT: "16666",
      LUCKY_ALLOWED_DOMAIN_SUFFIX: ".example.com, lab.test",
    });
    expect(env.baseUrl).toBe("http://127.0.0.1:16601");
    expect(env.tlsVerify).toBe(false);
    expect(env.defaultListenPort).toBe(16666);
    expect(env.allowedDomainSuffixes).toEqual(["example.com", "lab.test"]);
  });
});
