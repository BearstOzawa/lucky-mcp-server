import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/lib/redact.js";

describe("redactSecrets", () => {
  it("redacts nested token and password fields", () => {
    expect(
      redactSecrets({
        OpenToken: "secret",
        BasicAuthPasswd: "pw",
        nested: { cookie: "abc" },
        ok: 1,
      }),
    ).toEqual({
      OpenToken: "[REDACTED]",
      BasicAuthPasswd: "[REDACTED]",
      nested: { cookie: "[REDACTED]" },
      ok: 1,
    });
  });
});
