import { describe, expect, it } from "vitest";
import { compactRule } from "../src/web-rules/normalize.js";
import { removeRouteByDomain, upsertRoute } from "../src/web-rules/mutate.js";
import { camelCaseRule, sampleHttpsRule } from "./fixtures/web-rule.js";

describe("upsertRoute", () => {
  it("updates an existing hostname without touching sibling routes", () => {
    const result = upsertRoute(sampleHttpsRule(), {
      domain: "wiki.example.com",
      backend: "http://127.0.0.1:4000",
      name: "wiki-v2",
    });
    expect(result.action).toBe("updated");
    const compact = compactRule(result.rule);
    expect(compact.routes).toHaveLength(2);
    expect(compact.routes[0]?.backend).toBe("http://127.0.0.1:4000");
    expect(compact.routes[0]?.name).toBe("wiki-v2");
    expect(compact.routes[1]?.domains).toEqual(["old.example.com"]);
    expect(Object.keys(result.rule)).toContain("ProxyList");
    expect(Object.keys((result.rule.ProxyList as object[])[0] as object)).toContain("ProxyPass");
  });

  it("clones an existing reverse-proxy route when adding a hostname", () => {
    const result = upsertRoute(sampleHttpsRule(), {
      domain: "outline.example.com",
      backend: "http://127.0.0.1:3001",
      name: "outline",
    });
    expect(result.action).toBe("created");
    const compact = compactRule(result.rule);
    expect(compact.routes).toHaveLength(3);
    const created = compact.routes.find((route) => route.domains.includes("outline.example.com"));
    expect(created?.backend).toBe("http://127.0.0.1:3001");
    expect(created?.reverseProxy).toBe(true);
    expect(created?.key).not.toBe("route-wiki");
    const template = (result.rule.ProxyList as Array<Record<string, unknown>>)[2];
    expect(template?.EnableAccessLog).toBe(true);
    expect(template?.LogLevel).toBe(4);
  });

  it("preserves camelCase field names", () => {
    const result = upsertRoute(camelCaseRule(), {
      domain: "new.example.com",
      backend: "http://127.0.0.1:9",
    });
    expect(Object.keys(result.rule)).toContain("proxyList");
    const created = (result.rule.proxyList as Array<Record<string, unknown>>)[1];
    expect(created).toMatchObject({
      locations: ["new.example.com"],
      proxyPass: "http://127.0.0.1:9",
    });
  });

  it("maps Lucky 3.0 Domains and Locations without overwriting siblings", () => {
    const native = {
      RuleKey: "listener-https",
      RuleName: "11443",
      Enable: true,
      ListenPort: 11443,
      EnableTLS: true,
      ProxyList: [
        {
          Key: "route-wiki",
          Enable: true,
          Remark: "wiki",
          WebServiceType: "reverseproxy",
          Domains: ["wiki.example.com"],
          Locations: ["http://127.0.0.1:3000"],
        },
      ],
    };
    const created = upsertRoute(native, {
      domain: "outline.example.com",
      backend: "http://127.0.0.1:23000",
      name: "outline",
    });
    expect(created.action).toBe("created");
    const compact = compactRule(created.rule);
    expect(compact.listenPort).toBe(11443);
    expect(compact.tls).toBe(true);
    expect(compact.routes.map((route) => route.domains[0])).toEqual(["wiki.example.com", "outline.example.com"]);
    const added = (created.rule.ProxyList as Array<Record<string, unknown>>)[1];
    expect(added?.Domains).toEqual(["outline.example.com"]);
    expect(added?.Locations).toEqual(["http://127.0.0.1:23000"]);
    expect(added).not.toHaveProperty("ProxyPass");
  });

  it("updates HttpClientTimeout without dropping extra domains", () => {
    const native = {
      RuleKey: "listener-https",
      Enable: true,
      ListenPort: 11443,
      EnableTLS: true,
      ProxyList: [
        {
          Key: "route-outline",
          Enable: true,
          Remark: "outline",
          WebServiceType: "reverseproxy",
          Domains: ["outline.lili.uno", "outline.bearst.org"],
          Locations: ["http://192.168.2.100:23000"],
          HttpClientTimeout: 10,
        },
      ],
    };
    const result = upsertRoute(native, {
      domain: "outline.lili.uno",
      backend: "http://192.168.2.100:23000",
      httpClientTimeout: 120,
    });
    expect(result.action).toBe("updated");
    const route = (result.rule.ProxyList as Array<Record<string, unknown>>)[0];
    expect(route?.HttpClientTimeout).toBe(120);
    expect(route?.Domains).toEqual(["outline.lili.uno", "outline.bearst.org"]);
    expect(compactRule(result.rule).routes[0]?.http_client_timeout).toBe(120);
  });

  it("removes only the matching hostname", () => {
    const result = removeRouteByDomain(sampleHttpsRule(), "wiki.example.com");
    expect(result.removed).toBe(true);
    expect(compactRule(result.rule).routes.map((route) => route.domains[0])).toEqual(["old.example.com"]);
  });
});
