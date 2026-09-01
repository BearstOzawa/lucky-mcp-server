import { describe, expect, it } from "vitest";
import { extractObjectList, unwrapLucky } from "../src/lucky/envelope.js";
import { compactRule } from "../src/web-rules/normalize.js";

describe("Lucky 3.0 envelopes", () => {
  it("unwraps rule and ruleList payloads", () => {
    expect(unwrapLucky({ ret: 0, rule: { RuleKey: "abc", ListenPort: 11443 } })).toEqual({
      RuleKey: "abc",
      ListenPort: 11443,
    });
    expect(extractObjectList(unwrapLucky({ ret: 0, ruleList: [{ RuleKey: "a" }, { RuleKey: "b" }] }))).toEqual([
      { RuleKey: "a" },
      { RuleKey: "b" },
    ]);
    expect(extractObjectList({ ret: 0, list: null, Moduledisable: false })).toEqual([]);
  });

  it("reads Domains as hostnames and Locations as backends", () => {
    const compact = compactRule({
      RuleKey: "EJTeEnTyMKv6FUZK",
      RuleName: "11443",
      Enable: true,
      ListenPort: 11443,
      EnableTLS: true,
      ProxyList: [
        {
          Key: "r1",
          Remark: "outline",
          Enable: true,
          WebServiceType: "reverseproxy",
          Domains: ["outline.lili.uno"],
          Locations: ["http://192.168.2.100:23000"],
          HttpClientTimeout: 10,
        },
      ],
    });
    expect(compact.routes[0]).toMatchObject({
      name: "outline",
      domains: ["outline.lili.uno"],
      backend: "http://192.168.2.100:23000",
      reverseProxy: true,
      http_client_timeout: 10,
    });
  });
});
