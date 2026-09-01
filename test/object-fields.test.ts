import { describe, expect, it } from "vitest";
import { getField, setField } from "../src/lib/object-fields.js";

describe("object-fields", () => {
  it("reads PascalCase and camelCase through aliases", () => {
    expect(getField({ ListenPort: 16666 }, ["listenPort", "ListenPort"])).toBe(16666);
    expect(getField({ listenPort: 443 }, ["ListenPort"])).toBe(443);
  });

  it("writes back to the existing key name", () => {
    const object = { ProxyPass: "http://127.0.0.1:1" };
    setField(object, ["proxyPass", "ProxyPass"], "http://127.0.0.1:2");
    expect(object).toEqual({ ProxyPass: "http://127.0.0.1:2" });
  });
});
