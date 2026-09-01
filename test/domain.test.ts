import { describe, expect, it } from "vitest";
import { assertDomainAllowed, normalizeBackend, normalizeDomain } from "../src/web-rules/domain.js";

describe("domain helpers", () => {
  it("strips scheme, path, and port from domains", () => {
    expect(normalizeDomain("https://Wiki.Example.com:16666/path")).toBe("wiki.example.com");
  });

  it("adds http:// to bare backends and strips a trailing slash", () => {
    expect(normalizeBackend("127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(normalizeBackend("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  });

  it("enforces allowed domain suffixes", () => {
    expect(() => assertDomainAllowed("evil.test", ["example.com"])).toThrow(/not allowed/);
    expect(() => assertDomainAllowed("wiki.example.com", ["example.com"])).not.toThrow();
  });
});
