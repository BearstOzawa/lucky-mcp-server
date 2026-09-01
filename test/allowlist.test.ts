import { describe, expect, it } from "vitest";
import { assertPathAllowed, isDeniedPath } from "../src/lucky/allowlist.js";

describe("allowlist", () => {
  it("allows web rule GET/PUT with a key", () => {
    expect(() => assertPathAllowed("GET", "/api/webservice/rule/abc")).not.toThrow();
    expect(() => assertPathAllowed("PUT", "/api/webservice/rule/abc")).not.toThrow();
  });

  it("blocks login and OpenToken paths", () => {
    expect(isDeniedPath("/api/login")).toBe(true);
    expect(() => assertPathAllowed("POST", "/api/login")).toThrow(/blocked/);
    expect(() => assertPathAllowed("GET", "/api/not-a-real-path")).toThrow(/allowlist/);
    expect(() => assertPathAllowed("GET", "/api/baseconfigure")).not.toThrow();
    expect(() => assertPathAllowed("PUT", "/api/baseconfigure")).toThrow(/blocked/);
    expect(() => assertPathAllowed("GET", "/api/cron/list")).not.toThrow();
    expect(() => assertPathAllowed("POST", "/api/status/host-process-kill")).toThrow(/blocked/);
  });
});
