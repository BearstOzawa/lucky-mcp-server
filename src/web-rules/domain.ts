import { LuckyError } from "../lib/errors.js";

export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/.*$/, "");
  value = value.replace(/\.$/, "");
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  } else if (value.includes(":") && !value.includes("::")) {
    value = value.slice(0, value.indexOf(":"));
  }
  if (!value || value.includes("/") || value.includes(" ")) {
    throw new LuckyError(`invalid domain: ${input}`, "invalid");
  }
  return value;
}

export function normalizeBackend(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LuckyError(`invalid backend URL: ${input}`, "invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LuckyError(`backend must be http(s): ${input}`, "invalid");
  }
  if (url.pathname === "/" && !url.search && !url.hash) {
    return `${url.protocol}//${url.host}`;
  }
  return url.href;
}

export function domainMatches(pattern: string, domain: string): boolean {
  const normalizedPattern = normalizeDomain(pattern);
  if (normalizedPattern === domain) {
    return true;
  }
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return domain === suffix || domain.endsWith(`.${suffix}`);
  }
  return false;
}

export function assertDomainAllowed(domain: string, suffixes: string[]): void {
  if (suffixes.length === 0) {
    return;
  }
  const ok = suffixes.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
  if (!ok) {
    throw new LuckyError(
      `domain ${domain} is not allowed. Allowed suffixes: ${suffixes.join(", ")}`,
      "forbidden",
    );
  }
}
