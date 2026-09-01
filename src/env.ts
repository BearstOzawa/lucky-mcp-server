import { LuckyError } from "./lib/errors.js";

export interface Env {
  baseUrl: string;
  openToken: string;
  timeoutMs: number;
  tlsVerify: boolean;
  debug: boolean;
  defaultRuleKey?: string;
  defaultListenPort?: number;
  allowedDomainSuffixes: string[];
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const baseUrl = required(source.LUCKY_BASE_URL, "LUCKY_BASE_URL");
  const openToken = required(source.LUCKY_OPEN_TOKEN, "LUCKY_OPEN_TOKEN");
  const timeoutMs = optionalNumber(source.LUCKY_TIMEOUT_MS, 15_000);
  if (timeoutMs < 1000) {
    throw new LuckyError("LUCKY_TIMEOUT_MS must be at least 1000", "config");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new LuckyError("LUCKY_BASE_URL must be an absolute http(s) URL", "config");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new LuckyError("LUCKY_BASE_URL must use http:// or https://", "config");
  }

  const defaultListenPort = optionalNumber(source.LUCKY_DEFAULT_LISTEN_PORT, undefined);
  const suffixes = (source.LUCKY_ALLOWED_DOMAIN_SUFFIX ?? "")
    .split(",")
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    openToken,
    timeoutMs,
    tlsVerify: !isFalse(source.LUCKY_TLS_VERIFY),
    debug: isTrue(source.LUCKY_DEBUG),
    defaultRuleKey: emptyToUndefined(source.LUCKY_DEFAULT_RULE_KEY),
    defaultListenPort,
    allowedDomainSuffixes: suffixes,
  };
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new LuckyError(`${name} is required`, "config");
  }
  return trimmed;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: string | undefined, fallback: number): number;
function optionalNumber(value: string | undefined, fallback: undefined): number | undefined;
function optionalNumber(value: string | undefined, fallback: number | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new LuckyError(`invalid number: ${trimmed}`, "config");
  }
  return parsed;
}

function isTrue(value: string | undefined): boolean {
  return /^(true|1|yes)$/i.test(value?.trim() ?? "");
}

function isFalse(value: string | undefined): boolean {
  return /^(false|0|no)$/i.test(value?.trim() ?? "");
}
