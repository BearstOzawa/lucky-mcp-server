import { getBoolean, getNumber, getString, getStringArray, isRecord } from "../lib/object-fields.js";
import { extractObjectList } from "../lucky/envelope.js";
import { domainMatches, normalizeDomain } from "./domain.js";
import {
  BACKEND_FIELDS,
  CERT_KEY_FIELDS,
  DOMAIN_FIELDS,
  HTTP_CLIENT_TIMEOUT_FIELDS,
  LOCATION_FIELDS,
  ENABLE_FIELDS,
  LISTEN_IP_FIELDS,
  LISTEN_PORT_FIELDS,
  NETWORK_FIELDS,
  ROUTE_KEY_FIELDS,
  ROUTE_LIST_FIELDS,
  ROUTE_NAME_FIELDS,
  RULE_KEY_FIELDS,
  RULE_NAME_FIELDS,
  TLS_FIELDS,
  TYPE_FIELDS,
  type CompactRoute,
  type CompactRule,
  type NativeRuleRef,
} from "./types.js";

export function nativeRulesFromPayload(payload: unknown): Record<string, unknown>[] {
  return extractObjectList(payload).filter(looksLikeRule);
}

export function looksLikeRule(value: Record<string, unknown>): boolean {
  return (
    getNumber(value, LISTEN_PORT_FIELDS) !== undefined ||
    getString(value, RULE_KEY_FIELDS) !== undefined ||
    Array.isArray(getRouteList(value).list)
  );
}

export function getRouteList(rule: Record<string, unknown>): {
  key: string;
  list: unknown[];
} {
  for (const name of ROUTE_LIST_FIELDS) {
    const value = rule[name];
    if (Array.isArray(value)) {
      return { key: name, list: value };
    }
  }
  for (const name of ROUTE_LIST_FIELDS) {
    const match = Object.keys(rule).find((key) => key.toLowerCase() === name.toLowerCase());
    if (match && Array.isArray(rule[match])) {
      return { key: match, list: rule[match] as unknown[] };
    }
  }
  return { key: "ProxyList", list: [] };
}

export function compactRule(native: Record<string, unknown>): CompactRule {
  const { list } = getRouteList(native);
  return {
    key: getString(native, RULE_KEY_FIELDS) ?? "",
    name: getString(native, RULE_NAME_FIELDS) ?? "",
    enable: getBoolean(native, ENABLE_FIELDS) ?? true,
    listenIp: getString(native, LISTEN_IP_FIELDS) ?? "",
    listenPort: getNumber(native, LISTEN_PORT_FIELDS) ?? 0,
    tls: getBoolean(native, TLS_FIELDS) ?? false,
    network: getString(native, NETWORK_FIELDS) ?? "",
    certKey: getString(native, CERT_KEY_FIELDS),
    routes: list.filter(isRecord).map(compactRoute),
  };
}

export function compactRoute(native: Record<string, unknown>): CompactRoute {
  const type = getString(native, TYPE_FIELDS) ?? "";
  const locations = getStringArray(native, LOCATION_FIELDS);
  const locationUrls = locations.filter(isHttpUrl);
  const locationHosts = locations.filter((item) => !isHttpUrl(item));
  const namedDomains = getStringArray(native, DOMAIN_FIELDS);
  const domains = (namedDomains.length > 0 ? namedDomains : locationHosts).map((item) => {
    try {
      return normalizeDomain(item);
    } catch {
      return item;
    }
  });
  const backend = getString(native, BACKEND_FIELDS) ?? locationUrls[0];
  return {
    key: getString(native, ROUTE_KEY_FIELDS) ?? "",
    name: getString(native, ROUTE_NAME_FIELDS) ?? "",
    enable: getBoolean(native, ENABLE_FIELDS) ?? true,
    type,
    domains,
    backend,
    reverseProxy: isReverseProxy(type, backend),
    http_client_timeout: getNumber(native, HTTP_CLIENT_TIMEOUT_FIELDS),
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isReverseProxy(type: string, backend: string | undefined): boolean {
  const normalized = type.trim().toLowerCase();
  if (
    normalized.includes("redirect") ||
    normalized.includes("file") ||
    normalized.includes("static") ||
    normalized.includes("folder")
  ) {
    return false;
  }
  if (
    normalized === "" ||
    normalized.includes("reverse") ||
    normalized.includes("proxy") ||
    normalized === "http" ||
    normalized === "https"
  ) {
    return true;
  }
  return Boolean(backend && /^https?:\/\//i.test(backend));
}

export function findRouteByDomain(
  rules: NativeRuleRef[],
  domain: string,
): { rule: NativeRuleRef; route: CompactRoute } | undefined {
  for (const rule of rules) {
    const route = rule.compact.routes.find((item) =>
      item.domains.some((candidate) => domainMatches(candidate, domain)),
    );
    if (route) {
      return { rule, route };
    }
  }
  return undefined;
}

export function toNativeRefs(natives: Record<string, unknown>[]): NativeRuleRef[] {
  return natives.map((native) => ({
    native,
    compact: compactRule(native),
  }));
}
