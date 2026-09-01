import { randomBytes } from "node:crypto";
import { LuckyError } from "../lib/errors.js";
import { actualKey, cloneJson, getStringArray, isRecord, setField } from "../lib/object-fields.js";
import { domainMatches } from "./domain.js";
import { compactRoute, getRouteList, isReverseProxy } from "./normalize.js";
import {
  BACKEND_FIELDS,
  BASIC_AUTH_ENABLE_FIELDS,
  BASIC_AUTH_PASS_FIELDS,
  BASIC_AUTH_USER_FIELDS,
  DOMAIN_FIELDS,
  ENABLE_FIELDS,
  HTTP_CLIENT_TIMEOUT_FIELDS,
  LOCATION_FIELDS,
  INSECURE_TLS_FIELDS,
  ROUTE_KEY_FIELDS,
  ROUTE_NAME_FIELDS,
  TYPE_FIELDS,
} from "./types.js";

export interface RoutePatch {
  domain: string;
  backend: string;
  name?: string;
  enabled?: boolean;
  basicAuthUser?: string;
  basicAuthPassword?: string;
  insecureBackendTls?: boolean;
  httpClientTimeout?: number;
}

export interface MutateResult {
  action: "created" | "updated";
  rule: Record<string, unknown>;
  route: Record<string, unknown>;
}

export function upsertRoute(nativeRule: Record<string, unknown>, patch: RoutePatch): MutateResult {
  const rule = cloneJson(nativeRule);
  const { key: listKey, list } = getRouteList(rule);
  const routes = list.filter(isRecord);
  const existingIndex = routes.findIndex((route) => routeHasDomain(route, patch.domain));

  if (existingIndex >= 0) {
    const current = routes[existingIndex];
    if (!current) {
      throw new LuckyError("existing reverse-proxy route is missing", "internal");
    }
    applyPatch(current, patch, false);
    routes[existingIndex] = current;
    rule[listKey] = routes;
    return { action: "updated", rule, route: current };
  }

  const created = createRoute(routes, patch);
  routes.push(created);
  rule[listKey] = routes;
  return { action: "created", rule, route: created };
}

export function removeRouteByDomain(
  nativeRule: Record<string, unknown>,
  domain: string,
): { removed: boolean; rule: Record<string, unknown>; routeKey?: string } {
  const rule = cloneJson(nativeRule);
  const { key: listKey, list } = getRouteList(rule);
  const routes = list.filter(isRecord);
  const index = routes.findIndex((route) => routeHasDomain(route, domain));
  if (index < 0) {
    return { removed: false, rule };
  }
  const [removed] = routes.splice(index, 1);
  rule[listKey] = routes;
  return {
    removed: true,
    rule,
    routeKey: removed ? compactRoute(removed).key : undefined,
  };
}

export function setRouteEnabled(
  nativeRule: Record<string, unknown>,
  domain: string,
  enabled: boolean,
): { rule: Record<string, unknown>; route: Record<string, unknown> } {
  const rule = cloneJson(nativeRule);
  const { key: listKey, list } = getRouteList(rule);
  const routes = list.filter(isRecord);
  const current = routes.find((route) => routeHasDomain(route, domain));
  if (!current) {
    throw new LuckyError(`no reverse-proxy route found for ${domain}`, "not_found");
  }
  setField(current, ENABLE_FIELDS, enabled);
  rule[listKey] = routes;
  return { rule, route: current };
}

function routeHasDomain(route: Record<string, unknown>, domain: string): boolean {
  return compactRoute(route).domains.some((candidate) => domainMatches(candidate, domain));
}

function applyPatch(route: Record<string, unknown>, patch: RoutePatch, isCreate: boolean): void {
  if (usesDomainField(route)) {
    if (isCreate || !routeHasDomain(route, patch.domain)) {
      setField(route, DOMAIN_FIELDS, [patch.domain]);
    }
    if (locationsHoldBackends(route)) {
      setField(route, LOCATION_FIELDS, [patch.backend]);
    }
  } else if (isCreate || !routeHasDomain(route, patch.domain)) {
    setField(route, LOCATION_FIELDS, [patch.domain]);
  }
  if (actualKey(route, BACKEND_FIELDS) || !locationsHoldBackends(route)) {
    setField(route, BACKEND_FIELDS, patch.backend);
  }
  if (patch.name !== undefined || isCreate) {
    setField(route, ROUTE_NAME_FIELDS, patch.name ?? patch.domain);
  }
  if (patch.enabled !== undefined || isCreate) {
    setField(route, ENABLE_FIELDS, patch.enabled ?? true);
  }
  if (isCreate) {
    const typeKey = actualKey(route, TYPE_FIELDS);
    if (!typeKey || !String(route[typeKey] ?? "").trim()) {
      setField(route, TYPE_FIELDS, "reverseproxy");
    }
  }
  if (patch.basicAuthUser !== undefined && patch.basicAuthPassword !== undefined) {
    setField(route, BASIC_AUTH_ENABLE_FIELDS, true);
    setField(route, BASIC_AUTH_USER_FIELDS, patch.basicAuthUser);
    setField(route, BASIC_AUTH_PASS_FIELDS, patch.basicAuthPassword);
  }
  if (patch.insecureBackendTls !== undefined) {
    setField(route, INSECURE_TLS_FIELDS, patch.insecureBackendTls);
  }
  if (patch.httpClientTimeout !== undefined) {
    setField(route, HTTP_CLIENT_TIMEOUT_FIELDS, patch.httpClientTimeout);
  }
}

function createRoute(existing: Record<string, unknown>[], patch: RoutePatch): Record<string, unknown> {
  const template =
    existing.find((route) => {
      const compact = compactRoute(route);
      return compact.reverseProxy;
    }) ?? existing[0];

  const created = template ? cloneJson(template) : minimalRoute();
  setField(created, ROUTE_KEY_FIELDS, uniqueKey(existing));
  applyPatch(created, patch, true);
  if (!isReverseProxy(compactRoute(created).type, patch.backend)) {
    setField(created, TYPE_FIELDS, "reverseproxy");
  }
  return created;
}

function usesDomainField(route: Record<string, unknown>): boolean {
  return Boolean(actualKey(route, DOMAIN_FIELDS)) || locationsHoldBackends(route);
}

function locationsHoldBackends(route: Record<string, unknown>): boolean {
  const locations = getStringArray(route, LOCATION_FIELDS);
  if (locations.some((item) => /^https?:\/\//i.test(item))) {
    return true;
  }
  return Boolean(actualKey(route, ["WebServiceType", "webServiceType"]));
}

function uniqueKey(existing: Record<string, unknown>[]): string {
  const used = new Set(existing.map((route) => compactRoute(route).key).filter(Boolean));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const key = randomBytes(8).toString("hex");
    if (!used.has(key)) {
      return key;
    }
  }
  throw new LuckyError("unable to allocate a unique route key", "internal");
}

function minimalRoute(): Record<string, unknown> {
  return {
    Key: "",
    Enable: true,
    Locations: [],
    ProxyPass: "",
    ProxyType: "reverseproxy",
    Remark: "",
    EnableAccessLog: true,
    LogLevel: 4,
    AccessLogMaxNum: 500,
    WebListShowLastLogMaxCount: 3,
    ForwardedByClientIP: true,
    RemoteIPHeaders: ["X-Forwarded-For", "X-Real-IP"],
    EnableBasicAuth: false,
  };
}
