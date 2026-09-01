export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AllowedEndpoint {
  method: HttpMethod;
  path: string;
}

export const ALLOWED_PREFIXES = [
  "/version",
  "/api/info",
  "/api/modules/list",
  "/api/modules/hidden",
  "/api/baseconfigure",
  "/api/netinterfaces",
  "/api/logs",
  "/api/webservice",
  "/api/ssl",
  "/api/portforward",
  "/api/ddns",
  "/api/stun",
  "/api/wol",
  "/api/cron",
  "/api/ftpserver",
  "/api/webdav",
  "/api/docker",
  "/api/ipfliter",
  "/api/security-groups",
  "/api/logscenter",
  "/api/storagemanagement",
  "/api/status",
  "/api/webterminal",
  "/api/ipdb",
  "/api/cloudflared",
  "/api/coraza",
  "/api/rclone",
  "/api/local-path-browser",
  "/api/thirdPartyAuthManager",
  "/api/oauth/status",
  "/api/oauth/userinfo",
  "/api/iconlib",
] as const;

const alwaysDenied =
  /\/(?:login|logout|2fa|restoreconfigureconfirm|reboot_program|opentoken|password|twofapassword|adminaccount)(?:\/|$)/i;

const extraDenied = [
  "/api/status/host-process-kill",
  "/api/oauth/login",
  "/api/update/comfire",
  "/api/lucky/service",
];

export function isDeniedPath(path: string): boolean {
  const clean = normalizePath(path);
  if (alwaysDenied.test(clean)) {
    return true;
  }
  return extraDenied.some((item) => clean === item || clean.startsWith(`${item}/`));
}

export function isDenied(method: string, path: string): boolean {
  const clean = normalizePath(path);
  if (isDeniedPath(clean)) {
    return true;
  }
  const upper = method.toUpperCase();
  if (upper !== "GET" && /\/api\/(?:base)?configure$/i.test(clean)) {
    return true;
  }
  if (upper !== "GET" && /\/api\/modules\/[^/]+\/2fa\//i.test(clean)) {
    return true;
  }
  return false;
}

export function pathAllowed(path: string): boolean {
  const clean = normalizePath(path);
  return ALLOWED_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

export function findAllowed(method: string, path: string): AllowedEndpoint | undefined {
  const clean = normalizePath(path);
  const upper = method.toUpperCase() as HttpMethod;
  if (!pathAllowed(clean)) {
    return undefined;
  }
  return { method: upper, path: clean };
}

export function assertPathAllowed(method: string, path: string): AllowedEndpoint {
  const clean = normalizePath(path);
  if (isDenied(method, clean)) {
    throw new Error(`Lucky API path is blocked: ${method} ${clean}`);
  }
  const allowed = findAllowed(method, clean);
  if (!allowed) {
    throw new Error(
      `Lucky API is not on the allowlist: ${method} ${clean}. Use a dedicated tool when one exists.`,
    );
  }
  return allowed;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  if (!withoutQuery.startsWith("/")) {
    return `/${withoutQuery}`;
  }
  return withoutQuery.replace(/\/+$/, "") || "/";
}
