import type { Env } from "../env.js";
import { LuckyError, LuckyHttpError } from "../lib/errors.js";
import { cloneJson, isRecord, setField } from "../lib/object-fields.js";
import type { LuckyHttp } from "../lucky/http.js";
import { assertDomainAllowed, normalizeBackend, normalizeDomain } from "./domain.js";
import {
  compactRoute,
  compactRule,
  findRouteByDomain,
  nativeRulesFromPayload,
  toNativeRefs,
} from "./normalize.js";
import { removeRouteByDomain, setRouteEnabled, upsertRoute } from "./mutate.js";
import { exposeHint, publicUrl } from "./public-url.js";
import {
  CERT_KEY_FIELDS,
  TLS_FIELDS,
  type CompactRule,
  type ExposeInput,
  type ExposeResult,
  type NativeRuleRef,
  type UnexposeResult,
} from "./types.js";

export async function listWebRules(http: LuckyHttp): Promise<CompactRule[]> {
  const natives = await loadNativeRules(http, false);
  const hydrated: CompactRule[] = [];
  for (const item of natives) {
    if (!item.compact.key) {
      hydrated.push(item.compact);
      continue;
    }
    try {
      hydrated.push(compactRule(await loadNativeRule(http, item.compact.key)));
    } catch {
      hydrated.push(item.compact);
    }
  }
  return hydrated;
}

export async function getWebRule(http: LuckyHttp, ruleKey: string): Promise<CompactRule> {
  const native = await loadNativeRule(http, ruleKey);
  return compactRule(native);
}

export async function exposeService(http: LuckyHttp, env: Env, input: ExposeInput): Promise<ExposeResult> {
  const domain = normalizeDomain(input.domain);
  const backend = normalizeBackend(input.backend);
  assertDomainAllowed(domain, env.allowedDomainSuffixes);

  const rules = await loadNativeRules(http, false);
  if (rules.length === 0) {
    throw new LuckyError(
      "Lucky has no web service listeners. Create an HTTPS listener in Lucky first, then retry.",
      "not_found",
    );
  }

  const existing = findRouteByDomain(rules, domain);
  const parent = existing?.rule ?? pickParent(rules, env, input);
  const native = await loadNativeRule(http, parent.compact.key);
  const mutated = upsertRoute(native, {
    domain,
    backend,
    name: input.name,
    enabled: input.enabled,
    basicAuthUser: input.basicAuthUser,
    basicAuthPassword: input.basicAuthPassword,
    insecureBackendTls: input.insecureBackendTls,
    httpClientTimeout: input.httpClientTimeout,
  });

  await saveRule(http, parent.compact.key, mutated.rule);
  const saved = compactRule(mutated.rule);
  const route = compactRoute(mutated.route);

  return {
    action: mutated.action,
    domain,
    backend,
    public_url: publicUrl(domain, saved.listenPort, saved.tls),
    rule: {
      key: saved.key,
      name: saved.name,
      listen_port: saved.listenPort,
      tls: saved.tls,
    },
    route,
    hint: exposeHint(backend),
  };
}

export async function unexposeService(
  http: LuckyHttp,
  env: Env,
  input: { domain: string; ruleKey?: string },
): Promise<UnexposeResult> {
  const domain = normalizeDomain(input.domain);
  assertDomainAllowed(domain, env.allowedDomainSuffixes);
  const rules = await loadNativeRules(http, false);
  const existing = input.ruleKey
    ? findRouteByDomain(
        rules.filter((rule) => rule.compact.key === input.ruleKey),
        domain,
      )
    : findRouteByDomain(rules, domain);

  if (!existing) {
    return { action: "missing", domain };
  }

  const native = await loadNativeRule(http, existing.rule.compact.key);
  const mutated = removeRouteByDomain(native, domain);
  if (mutated.removed) {
    await saveRule(http, existing.rule.compact.key, mutated.rule);
  }
  return {
    action: mutated.removed ? "removed" : "missing",
    domain,
    rule_key: existing.rule.compact.key,
    route_key: mutated.routeKey,
  };
}

export async function setDomainEnabled(
  http: LuckyHttp,
  input: { domain: string; enabled: boolean },
): Promise<{ domain: string; enabled: boolean; rule_key: string; route: ReturnType<typeof compactRoute> }> {
  const domain = normalizeDomain(input.domain);
  const rules = await loadNativeRules(http, false);
  const existing = findRouteByDomain(rules, domain);
  if (!existing) {
    throw new LuckyError(`no reverse-proxy route found for ${domain}`, "not_found");
  }
  const native = await loadNativeRule(http, existing.rule.compact.key);
  const mutated = setRouteEnabled(native, domain, input.enabled);
  await saveRule(http, existing.rule.compact.key, mutated.rule);
  return {
    domain,
    enabled: input.enabled,
    rule_key: existing.rule.compact.key,
    route: compactRoute(mutated.route),
  };
}

export async function bindCert(
  http: LuckyHttp,
  env: Env,
  input: { certKey: string; ruleKey?: string; listenPort?: number; domain?: string },
): Promise<{ rule: CompactRule; cert_key: string }> {
  const rules = await loadNativeRules(http, false);
  if (rules.length === 0) {
    throw new LuckyError("Lucky has no web service listeners", "not_found");
  }

  let parent: NativeRuleRef;
  if (input.domain) {
    const domain = normalizeDomain(input.domain);
    const existing = findRouteByDomain(rules, domain);
    if (!existing) {
      throw new LuckyError(`no reverse-proxy route found for ${domain}`, "not_found");
    }
    parent = existing.rule;
  } else {
    parent = pickParent(rules, env, {
      domain: "",
      backend: "http://127.0.0.1",
      ruleKey: input.ruleKey,
      listenPort: input.listenPort,
    });
  }

  const next = cloneJson(await loadNativeRule(http, parent.compact.key));
  setField(next, CERT_KEY_FIELDS, input.certKey);
  setField(next, TLS_FIELDS, true);
  await saveRule(http, parent.compact.key, next);
  return { rule: compactRule(next), cert_key: input.certKey };
}

export async function readWebLogs(
  http: LuckyHttp,
  input: { domain?: string; ruleKey?: string; routeKey?: string; limit?: number },
): Promise<unknown> {
  const limit = input.limit ?? 50;
  if (input.domain) {
    const domain = normalizeDomain(input.domain);
    const rules = await loadNativeRules(http, false);
    const existing = findRouteByDomain(rules, domain);
    if (!existing) {
      throw new LuckyError(`no reverse-proxy route found for ${domain}`, "not_found");
    }
    return sliceLogs(
      await getLogs(http, existing.rule.compact.key, existing.route.key),
      limit,
    );
  }
  if (input.ruleKey && input.routeKey) {
    return sliceLogs(await getLogs(http, input.ruleKey, input.routeKey), limit);
  }
  if (input.ruleKey) {
    return sliceLogs(await tryGet(http, `/api/webservice/${encodeURIComponent(input.ruleKey)}/httpserver/logs`), limit);
  }
  return sliceLogs(await tryGet(http, "/api/webservice/lastlogs", "/api/webservice/logs"), limit);
}

export async function readStatus(http: LuckyHttp, env: Env): Promise<unknown> {
  const [version, info, modules] = await Promise.all([
    tryGet(http, "/version"),
    tryGet(http, "/api/info"),
    tryGet(http, "/api/modules/list"),
  ]);
  return {
    lucky: { version, info, modules },
    mcp: {
      base_url: env.baseUrl,
      tls_verify: env.tlsVerify,
      default_rule_key: env.defaultRuleKey ?? null,
      default_listen_port: env.defaultListenPort ?? null,
      allowed_domain_suffixes: env.allowedDomainSuffixes,
    },
  };
}

async function loadNativeRules(http: LuckyHttp, preferLite: boolean): Promise<NativeRuleRef[]> {
  if (preferLite) {
    const lite = await tryGet(http, "/api/webservice/rules_lite");
    const liteRules = nativeRulesFromPayload(lite);
    if (liteRules.length > 0) {
      return toNativeRefs(liteRules);
    }
  }

  const full = await tryGet(http, "/api/webservice/rules");
  const fullRules = nativeRulesFromPayload(full);
  if (fullRules.length > 0) {
    return toNativeRefs(fullRules);
  }

  if (!preferLite) {
    const lite = await tryGet(http, "/api/webservice/rules_lite");
    return toNativeRefs(nativeRulesFromPayload(lite));
  }
  return [];
}

async function loadNativeRule(http: LuckyHttp, ruleKey: string): Promise<Record<string, unknown>> {
  const payload = await http.get(`/api/webservice/rule/${encodeURIComponent(ruleKey)}`);
  if (isRecord(payload)) {
    return payload;
  }
  const list = nativeRulesFromPayload(payload);
  const match = list[0];
  if (!match) {
    throw new LuckyError(`Lucky web rule not found: ${ruleKey}`, "not_found");
  }
  return match;
}

async function saveRule(http: LuckyHttp, ruleKey: string, body: Record<string, unknown>): Promise<void> {
  if (!ruleKey) {
    throw new LuckyError("Lucky web rule is missing a key; cannot update", "invalid");
  }
  try {
    await http.put(`/api/webservice/rule/${encodeURIComponent(ruleKey)}`, body);
  } catch (error) {
    if (!(error instanceof LuckyError) || (error.code !== "network" && error.code !== "timeout")) {
      throw error;
    }
    await delay(3000);
    await loadNativeRule(http, ruleKey);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickParent(rules: NativeRuleRef[], env: Env, input: ExposeInput): NativeRuleRef {
  if (input.ruleKey) {
    const match = rules.find((rule) => rule.compact.key === input.ruleKey);
    if (!match) {
      throw new LuckyError(`Lucky web rule not found: ${input.ruleKey}`, "not_found");
    }
    return match;
  }
  if (input.listenPort !== undefined) {
    const match = rules.find((rule) => rule.compact.listenPort === input.listenPort);
    if (!match) {
      throw new LuckyError(`no web listener found on port ${input.listenPort}`, "not_found");
    }
    return match;
  }
  if (env.defaultRuleKey) {
    const match = rules.find((rule) => rule.compact.key === env.defaultRuleKey);
    if (!match) {
      throw new LuckyError(`LUCKY_DEFAULT_RULE_KEY not found: ${env.defaultRuleKey}`, "not_found");
    }
    return match;
  }
  if (env.defaultListenPort !== undefined) {
    const match = rules.find((rule) => rule.compact.listenPort === env.defaultListenPort);
    if (!match) {
      throw new LuckyError(`no web listener found on port ${env.defaultListenPort}`, "not_found");
    }
    return match;
  }

  const enabled = rules.filter((rule) => rule.compact.enable);
  const pool = enabled.length > 0 ? enabled : rules;
  const tls = pool.filter((rule) => rule.compact.tls);
  const candidates = tls.length > 0 ? tls : pool;
  const port443 = candidates.find((rule) => rule.compact.listenPort === 443);
  if (port443) {
    return port443;
  }
  if (candidates.length === 1) {
    const only = candidates[0];
    if (!only) {
      throw new LuckyError("Lucky has no usable web listener", "not_found");
    }
    return only;
  }
  return candidates.reduce((best, rule) =>
    rule.compact.routes.length > best.compact.routes.length ? rule : best,
  );
}

async function getLogs(http: LuckyHttp, ruleKey: string, routeKey: string): Promise<unknown> {
  return tryGet(
    http,
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(routeKey)}/logs`,
    `/api/webservice/${encodeURIComponent(ruleKey)}/httpserver/logs`,
  );
}

async function tryGet(http: LuckyHttp, ...paths: string[]): Promise<unknown> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await http.get(path);
    } catch (error) {
      lastError = error;
      if (error instanceof LuckyHttpError && (error.status === 404 || error.status === 405)) {
        continue;
      }
    }
  }
  if (lastError instanceof LuckyError) {
    throw lastError;
  }
  return [];
}

function sliceLogs(payload: unknown, limit: number): unknown {
  if (Array.isArray(payload)) {
    return payload.slice(-limit);
  }
  if (typeof payload === "string") {
    const lines = payload.split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  }
  if (isRecord(payload)) {
    for (const key of ["logs", "Logs", "list", "List", "data", "Data"]) {
      const inner = payload[key];
      if (Array.isArray(inner)) {
        return { ...payload, [key]: inner.slice(-limit) };
      }
    }
  }
  return payload;
}
