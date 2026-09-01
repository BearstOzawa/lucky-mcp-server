import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { sampleHttpsRule, sampleHttpRule } from "./fixtures/web-rule.js";

export interface FakeLucky {
  baseUrl: string;
  lastOpenToken?: string;
  lastUrl?: string;
  lastWake?: Record<string, string>;
  close(): Promise<void>;
}

export async function startFakeLucky(): Promise<FakeLucky> {
  const rules = new Map<string, Record<string, unknown>>([
    ["listener-https", sampleHttpsRule()],
    ["listener-http", sampleHttpRule()],
  ]);
  const certs = new Map<string, Record<string, unknown>>([
    [
      "cert-1",
      {
        Key: "cert-1",
        CertName: "example.com",
        Enable: true,
        Type: "custom",
        Domains: "example.com,*.example.com",
        Expire: "2027-01-01",
        Crt: "-----BEGIN CERTIFICATE-----",
        PrivateKey: "-----BEGIN PRIVATE KEY-----",
      },
    ],
  ]);
  const forwards = new Map<string, Record<string, unknown>>([
    [
      "pf-mc",
      {
        Key: "pf-mc",
        Name: "minecraft",
        Enable: true,
        ListenIP: "0.0.0.0",
        ListenPort: 25565,
        TargetIP: "192.168.1.10",
        TargetPort: 25565,
        Protocol: "tcp",
      },
    ],
  ]);
  const ddns = new Map<string, Record<string, unknown>>([
    [
      "ddns-1",
      {
        Key: "ddns-1",
        Name: "home",
        Enable: true,
        Provider: "cloudflare",
        Domain: "home.example.com",
        LastIP: "1.2.3.4",
        Token: "secret-token",
      },
    ],
  ]);
  const stun = new Map<string, Record<string, unknown>>([
    [
      "stun-1",
      {
        Key: "stun-1",
        Name: "game",
        Enable: true,
        ListenPort: 25565,
        PublicAddr: "8.8.8.8:12345",
      },
    ],
  ]);
  const wol = new Map<string, Record<string, unknown>>([
    [
      "nas",
      {
        Key: "nas",
        Name: "NAS",
        Enable: true,
        MAC: "aa:bb:cc:dd:ee:ff",
        BroadcastIP: "192.168.1.255",
      },
    ],
  ]);
  const cron = new Map<string, Record<string, unknown>>([
    [
      "cron-1",
      {
        Key: "cron-1",
        Name: "backup",
        Enable: true,
        CronExpr: "0 3 * * *",
        Command: "echo ok",
        Type: "shell",
      },
    ],
  ]);
  const ftp = {
    Enable: true,
    ListenPort: 2121,
    Password: "ftp-secret",
  };
  const blocked = new Map<string, Record<string, unknown>>([
    ["1.2.3.4", { IP: "1.2.3.4", Count: 3 }],
  ]);
  const storage = new Map<string, Record<string, unknown>>([
    ["store-1", { Key: "store-1", Name: "data", Enable: true }],
  ]);
  const terminals = new Map<string, Record<string, unknown>>([
    [
      "ssh-1",
      {
        Key: "ssh-1",
        Name: "router",
        Host: "192.168.1.1",
        Port: 22,
        User: "root",
        Password: "ssh-secret",
      },
    ],
  ]);

  const state: FakeLucky = {
    baseUrl: "",
    close: async () => undefined,
  };

  const server = createServer((request, response) => {
    state.lastOpenToken = header(request, "opentoken");
    state.lastUrl = request.url;
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";

    void readBody(request).then((body) => {
      try {
        handle(
          method,
          url,
          body,
          { rules, certs, forwards, ddns, stun, wol, cron, ftp, blocked, storage, terminals, state },
          response,
        );
      } catch (error) {
        json(response, 500, { ret: 1, msg: String(error) });
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("fake Lucky has no port");
  }
  state.baseUrl = `http://127.0.0.1:${address.port}`;
  state.close = () => new Promise((resolve) => server.close(() => resolve()));
  return state;
}

function handle(
  method: string,
  url: URL,
  body: unknown,
  store: {
    rules: Map<string, Record<string, unknown>>;
    certs: Map<string, Record<string, unknown>>;
    forwards: Map<string, Record<string, unknown>>;
    ddns: Map<string, Record<string, unknown>>;
    stun: Map<string, Record<string, unknown>>;
    wol: Map<string, Record<string, unknown>>;
    cron: Map<string, Record<string, unknown>>;
    ftp: Record<string, unknown>;
    blocked: Map<string, Record<string, unknown>>;
    storage: Map<string, Record<string, unknown>>;
    terminals: Map<string, Record<string, unknown>>;
    state: FakeLucky;
  },
  response: ServerResponse,
): void {
  const pathname = url.pathname;
  const key = url.searchParams.get("key") ?? "";

  if (method === "GET" && pathname === "/version") {
    json(response, 200, { version: "3.0.0" });
    return;
  }
  if (method === "GET" && pathname === "/api/info") {
    json(response, 200, { ret: 0, data: { name: "lucky" } });
    return;
  }
  if (method === "GET" && pathname === "/api/modules/list") {
    json(response, 200, { ret: 0, data: ["webservice", "ssl", "portforward", "ddns", "wol"] });
    return;
  }
  if (method === "GET" && pathname === "/api/baseconfigure") {
    json(response, 200, { ret: 0, data: { AdminAccount: "666", OpenToken: "must-redact", HttpPort: 16601 } });
    return;
  }

  if (method === "GET" && pathname === "/api/webservice/rules") {
    json(response, 200, { ret: 0, data: [...store.rules.values()] });
    return;
  }
  if (method === "GET" && pathname === "/api/webservice/rules_lite") {
    json(response, 200, { ret: 0, data: [...store.rules.values()] });
    return;
  }
  const ruleMatch = pathname.match(/^\/api\/webservice\/rule\/([^/]+)$/);
  if (ruleMatch) {
    const ruleKey = decodeURIComponent(ruleMatch[1] ?? "");
    if (method === "GET") {
      const rule = store.rules.get(ruleKey);
      if (!rule) {
        json(response, 404, { ret: 1, msg: "not found" });
        return;
      }
      json(response, 200, { ret: 0, data: rule });
      return;
    }
    if (method === "PUT" && isRecord(body)) {
      store.rules.set(ruleKey, body);
      json(response, 200, { ret: 0, msg: "ok" });
      return;
    }
  }
  const webLogs = pathname.match(/^\/api\/webservice\/([^/]+)\/([^/]+)\/logs$/);
  if (method === "GET" && webLogs) {
    json(response, 200, { ret: 0, data: [`GET ${webLogs[1]}/${webLogs[2]} 200`, "backend ok"] });
    return;
  }

  if (method === "GET" && pathname === "/api/ssl") {
    json(response, 200, { ret: 0, data: [...store.certs.values()] });
    return;
  }
  const sslMatch = pathname.match(/^\/api\/ssl\/([^/]+)$/);
  if (sslMatch && sslMatch[1] !== "manualsync") {
    const certKey = decodeURIComponent(sslMatch[1] ?? "");
    if (method === "GET" && store.certs.has(certKey)) {
      json(response, 200, { ret: 0, data: store.certs.get(certKey) });
      return;
    }
    if (method === "PUT" && isRecord(body)) {
      store.certs.set(certKey, body);
      json(response, 200, { ret: 0, msg: "ok" });
      return;
    }
  }
  if (method === "POST" && pathname === "/api/ssl" && isRecord(body)) {
    const certKey = String(body.Key ?? `cert-${store.certs.size + 1}`);
    store.certs.set(certKey, { ...body, Key: certKey });
    json(response, 200, { ret: 0, data: store.certs.get(certKey) });
    return;
  }
  const syncMatch = pathname.match(/^\/api\/ssl\/manualsync\/([^/]+)$/);
  if (method === "GET" && syncMatch) {
    json(response, 200, { ret: 0, msg: `synced ${syncMatch[1]}` });
    return;
  }

  if (method === "GET" && (pathname === "/api/portforwards" || pathname === "/api/portforwards_lite")) {
    json(response, 200, { ret: 0, data: [...store.forwards.values()] });
    return;
  }
  const pfGet = pathname.match(/^\/api\/portforward\/([^/]+)$/);
  if (method === "GET" && pfGet && pfGet[1] !== "enable") {
    const pfKey = decodeURIComponent(pfGet[1] ?? "");
    if (pfKey === "logs" || pfKey.endsWith("logs")) {
      json(response, 200, { ret: 0, data: ["forward ok"] });
      return;
    }
    const item = store.forwards.get(pfKey);
    if (!item) {
      json(response, 404, { ret: 1, msg: "not found" });
      return;
    }
    json(response, 200, { ret: 0, data: item });
    return;
  }
  const pfLogs = pathname.match(/^\/api\/portforward\/([^/]+)\/(logs|lastlogs)$/);
  if (method === "GET" && pfLogs) {
    json(response, 200, { ret: 0, data: [`pf ${pfLogs[1]}`] });
    return;
  }
  if (method === "POST" && pathname === "/api/portforward" && isRecord(body)) {
    const pfKey = String(body.Key ?? `pf-${store.forwards.size + 1}`);
    store.forwards.set(pfKey, { ...body, Key: pfKey });
    json(response, 200, { ret: 0, data: store.forwards.get(pfKey) });
    return;
  }
  if (method === "PUT" && pathname === "/api/portforward" && isRecord(body)) {
    store.forwards.set(key || String(body.Key), body);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "DELETE" && pathname === "/api/portforward") {
    store.forwards.delete(key);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "GET" && pathname === "/api/portforward/enable") {
    const item = store.forwards.get(key);
    if (item) {
      item.Enable = url.searchParams.get("enable") !== "false";
    }
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }

  if (method === "GET" && (pathname === "/api/ddnstasklist" || pathname === "/api/ddns/expanded")) {
    json(response, 200, { ret: 0, data: [...store.ddns.values()] });
    return;
  }
  const ddnsTask = pathname.match(/^\/api\/ddns\/task\/([^/]+)$/);
  if (method === "GET" && ddnsTask) {
    json(response, 200, { ret: 0, data: store.ddns.get(decodeURIComponent(ddnsTask[1] ?? "")) });
    return;
  }
  if (method === "GET" && pathname === "/api/ddns/enable") {
    const item = store.ddns.get(key);
    if (item) {
      item.Enable = url.searchParams.get("enable") !== "false";
    }
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  const ddnsSync = pathname.match(/^\/api\/ddns\/manualSync\/([^/]+)$/);
  if (method === "GET" && ddnsSync) {
    json(response, 200, { ret: 0, msg: `sync ${ddnsSync[1]}` });
    return;
  }
  if (method === "GET" && (pathname === "/api/ddns/logs" || pathname === "/api/ddns/lastlogs")) {
    json(response, 200, { ret: 0, data: ["ddns ok"] });
    return;
  }
  if (method === "PUT" && pathname === "/api/ddns" && isRecord(body)) {
    store.ddns.set(key || String(body.Key), body);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }

  if (method === "GET" && (pathname === "/api/stunrulelist" || pathname === "/api/stunrulelist_lite")) {
    json(response, 200, { ret: 0, data: [...store.stun.values()] });
    return;
  }
  if (method === "GET" && pathname === "/api/stunrule/enable") {
    const item = store.stun.get(key);
    if (item) {
      item.Enable = url.searchParams.get("enable") !== "false";
    }
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  const stunLogs = pathname.match(/^\/api\/stun\/([^/]+)\/(logs|lastlogs)$/);
  if (method === "GET" && stunLogs) {
    json(response, 200, { ret: 0, data: [`stun ${stunLogs[1]}`] });
    return;
  }

  if (method === "GET" && (pathname === "/api/wol/devices" || pathname === "/api/wol/devices_lite")) {
    json(response, 200, { ret: 0, data: [...store.wol.values()] });
    return;
  }
  if (method === "POST" && pathname === "/api/wol/device" && isRecord(body)) {
    const wolKey = String(body.Key ?? `wol-${store.wol.size + 1}`);
    store.wol.set(wolKey, { ...body, Key: wolKey });
    json(response, 200, { ret: 0, data: store.wol.get(wolKey) });
    return;
  }
  if (method === "GET" && pathname === "/api/wol/device/wakeup") {
    store.state.lastWake = Object.fromEntries(url.searchParams.entries());
    json(response, 200, { ret: 0, msg: "woken" });
    return;
  }

  if (method === "GET" && pathname === "/api/cron/list") {
    json(response, 200, { ret: 0, data: [...store.cron.values()] });
    return;
  }
  if (method === "POST" && pathname === "/api/cron/list" && isRecord(body)) {
    const cronKey = String(body.Key ?? `cron-${store.cron.size + 1}`);
    store.cron.set(cronKey, { ...body, Key: cronKey });
    json(response, 200, { ret: 0, data: store.cron.get(cronKey) });
    return;
  }
  if (method === "PUT" && pathname === "/api/cron/list" && isRecord(body)) {
    store.cron.set(key || String(body.Key), body);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "DELETE" && pathname === "/api/cron/list") {
    store.cron.delete(key);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "GET" && pathname === "/api/cron/enable") {
    const item = store.cron.get(key);
    if (item) {
      item.Enable = url.searchParams.get("enable") !== "false";
    }
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "POST" && pathname === "/api/cron/jobs/trigger") {
    json(response, 200, { ret: 0, msg: "triggered" });
    return;
  }
  if (method === "GET" && (pathname === "/api/cron/lastlogs" || pathname === "/api/cron/logs")) {
    json(response, 200, { ret: 0, data: ["cron ok"] });
    return;
  }

  if (method === "GET" && pathname === "/api/ftpserver/configure") {
    json(response, 200, { ret: 0, data: store.ftp });
    return;
  }
  if (method === "PUT" && pathname === "/api/ftpserver/configure" && isRecord(body)) {
    Object.assign(store.ftp, body);
    json(response, 200, { ret: 0, data: store.ftp });
    return;
  }
  if (method === "GET" && pathname === "/api/ftpserver/status") {
    json(response, 200, { ret: 0, data: { running: true } });
    return;
  }
  if (method === "GET" && pathname === "/api/webdav/configure") {
    json(response, 200, { ret: 0, data: { Enable: false } });
    return;
  }
  if (method === "GET" && pathname === "/api/webdav/status") {
    json(response, 200, { ret: 0, data: { running: false } });
    return;
  }

  if (method === "GET" && pathname === "/api/docker/containers") {
    json(response, 200, { ret: 0, data: [{ Name: "outline", State: "running" }] });
    return;
  }
  if (method === "GET" && pathname.startsWith("/api/docker/")) {
    json(response, 200, { ret: 0, data: [] });
    return;
  }

  if (method === "GET" && (pathname === "/api/ipfliter/listlite" || pathname === "/api/ipfliter/list")) {
    json(response, 200, { ret: 0, data: [{ Key: "black", Name: "blacklist", Enable: true, Mode: "black" }] });
    return;
  }
  if (method === "GET" && pathname.startsWith("/api/ipfliter/list/")) {
    json(response, 200, { ret: 0, data: { Key: pathname.split("/").pop(), Name: "blacklist", Enable: true } });
    return;
  }
  if (method === "GET" && pathname === "/api/ipfliter/porttrap/blockedips") {
    json(response, 200, { ret: 0, data: [...store.blocked.values()] });
    return;
  }
  if (method === "GET" && pathname === "/api/ipfliter/porttrap/stats") {
    json(response, 200, { ret: 0, data: { blocked: store.blocked.size } });
    return;
  }
  const unblock = pathname.match(/^\/api\/ipfliter\/porttrap\/blockedips\/([^/]+)$/);
  if (method === "DELETE" && unblock) {
    store.blocked.delete(decodeURIComponent(unblock[1] ?? ""));
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "GET" && pathname === "/api/ipfliter/porttrap/logs") {
    json(response, 200, { ret: 0, data: ["trap ok"] });
    return;
  }

  if (method === "GET" && (pathname === "/api/storagemanagement/list" || pathname === "/api/storagemanagement/litelist")) {
    json(response, 200, { ret: 0, data: [...store.storage.values()] });
    return;
  }
  if (method === "GET" && pathname === "/api/storagemanagement/enable") {
    const item = store.storage.get(key);
    if (item) {
      item.Enable = url.searchParams.get("enable") !== "false";
    }
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }

  if (method === "GET" && pathname === "/api/webterminal/connections") {
    json(response, 200, { ret: 0, data: [...store.terminals.values()] });
    return;
  }
  if (method === "POST" && pathname === "/api/webterminal/connections" && isRecord(body)) {
    const termKey = String(body.Key ?? `ssh-${store.terminals.size + 1}`);
    store.terminals.set(termKey, { ...body, Key: termKey });
    json(response, 200, { ret: 0, data: store.terminals.get(termKey) });
    return;
  }
  const termPut = pathname.match(/^\/api\/webterminal\/connections\/([^/]+)$/);
  if (method === "PUT" && termPut && isRecord(body)) {
    store.terminals.set(decodeURIComponent(termPut[1] ?? ""), body);
    json(response, 200, { ret: 0, msg: "ok" });
    return;
  }
  if (method === "GET" && pathname === "/api/webterminal/sessions") {
    json(response, 200, { ret: 0, data: [] });
    return;
  }

  if (method === "GET" && pathname === "/api/status/host-overview") {
    json(response, 200, { ret: 0, data: { cpu: 1, mem: 2 } });
    return;
  }
  if (method === "GET" && pathname === "/api/cloudflared/list") {
    json(response, 200, { ret: 0, data: [] });
    return;
  }
  if (method === "GET" && pathname === "/api/coraza/instancelist") {
    json(response, 200, { ret: 0, data: [] });
    return;
  }
  if (method === "GET" && pathname === "/api/ipdb/query") {
    json(response, 200, { ret: 0, data: { ip: url.searchParams.get("ip"), country: "CN" } });
    return;
  }
  if (method === "GET" && pathname === "/api/security-groups/lite") {
    json(response, 200, { ret: 0, data: [{ Key: "g1", Name: "admins", Enable: true }] });
    return;
  }
  if (method === "GET" && pathname === "/api/logscenter/stats") {
    json(response, 200, { ret: 0, data: { lines: 10 } });
    return;
  }
  if (method === "GET" && pathname === "/api/local-path-browser/roots") {
    json(response, 200, { ret: 0, data: ["/data"] });
    return;
  }

  json(response, 404, { ret: 1, msg: `missing ${method} ${pathname}` });
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(text);
      }
    });
    request.on("error", reject);
  });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
