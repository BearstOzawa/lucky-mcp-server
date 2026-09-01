import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./env.js";
import { runTool } from "./lib/mcp-result.js";
import { getString, isRecord } from "./lib/object-fields.js";
import type { LuckyHttp } from "./lucky/http.js";
import { identity, loadByKey, loadList, newKey, saveRecord, type QueryResource } from "./lucky/records.js";
import { bindCert } from "./web-rules/operations.js";

const resource: QueryResource = {
  listPaths: ["/api/ssl"],
  itemPath: "/api/ssl",
  getPath: "/api/ssl/{key}",
};

const TYPE_FIELDS = ["Type", "CertType", "type"] as const;
const NAME_FIELDS = ["CertName", "Name", "Remark"] as const;
const EXPIRE_FIELDS = ["Expire", "ExpireTime", "NotAfter", "ValidTo", "expire"] as const;
const CERT_PEM_FIELDS = ["Crt", "Cert", "Certificate", "CertPEM"] as const;
const KEY_PEM_FIELDS = ["PrivateKey", "KeyPem", "CertKey", "Pem"] as const;

export interface CompactCert {
  key: string;
  name: string;
  enable: boolean;
  type: string;
  domains: string[];
  expires_at?: string;
  has_material: boolean;
}

export function compactCert(native: Record<string, unknown>): CompactCert {
  const id = identity(native);
  const info = isRecord(native.CertsInfo) ? native.CertsInfo : undefined;
  const name = getString(native, NAME_FIELDS) ?? id.name;
  const domainsRaw = native.Domains ?? native.domains ?? native.DNSNames ?? info?.Domains ?? info?.SANs;
  const domains =
    typeof domainsRaw === "string"
      ? domainsRaw
          .split(/[,\s]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : Array.isArray(domainsRaw)
        ? domainsRaw.map((item) => String(item))
        : [];
  return {
    key: id.key,
    name,
    enable: id.enable,
    type: getString(native, TYPE_FIELDS) ?? getString(native, ["AddFrom", "addFrom"]) ?? "",
    domains,
    expires_at: getString(native, EXPIRE_FIELDS) ?? (info ? getString(info, ["NotAfterTime", "NotAfter"]) : undefined),
    has_material: Boolean(getString(native, CERT_PEM_FIELDS) || getString(native, KEY_PEM_FIELDS)),
  };
}

export async function listCerts(http: LuckyHttp): Promise<CompactCert[]> {
  return (await loadList(http, resource.listPaths)).map(compactCert);
}

export async function getCert(http: LuckyHttp, key: string): Promise<CompactCert> {
  return compactCert(await loadByKey(http, resource, key));
}

export async function addCustomCert(
  http: LuckyHttp,
  input: { name: string; domains: string[]; certPem: string; keyPem: string; enabled?: boolean },
): Promise<CompactCert> {
  const existing = await loadList(http, resource.listPaths);
  const native: Record<string, unknown> = {
    Key: newKey(existing),
    CertName: input.name,
    Name: input.name,
    Enable: input.enabled ?? true,
    Type: "custom",
    Domains: input.domains.join(","),
    Crt: input.certPem,
    PrivateKey: input.keyPem,
  };
  await saveRecord(http, resource, native, true);
  return compactCert(native);
}

export async function syncCert(http: LuckyHttp, key: string): Promise<unknown> {
  return http.get(`/api/ssl/manualsync/${encodeURIComponent(key)}`);
}

export function registerCertTools(server: McpServer, env: Env, http: LuckyHttp): void {
  server.registerTool(
    "lucky_list_certs",
    {
      title: "List Lucky certificates",
      description: "List SSL certificates in compact form (name, domains, expiry). PEM material is never returned.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => runTool(async () => ({ certs: await listCerts(http) })),
  );

  server.registerTool(
    "lucky_get_cert",
    {
      title: "Get a Lucky certificate",
      description: "Get compact certificate metadata by key. Private keys are not returned.",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => runTool(() => getCert(http, args.key)),
  );

  server.registerTool(
    "lucky_bind_cert",
    {
      title: "Bind a certificate to a Lucky listener",
      description:
        "Attach an existing Lucky certificate to a web listener and enable TLS. Select the listener with rule_key, listen_port, or a hostname already on that listener.",
      inputSchema: {
        cert_key: z.string().min(1),
        rule_key: z.string().optional(),
        listen_port: z.number().int().positive().optional(),
        domain: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool(() =>
        bindCert(http, env, {
          certKey: args.cert_key,
          ruleKey: args.rule_key,
          listenPort: args.listen_port,
          domain: args.domain,
        }),
      ),
  );

  server.registerTool(
    "lucky_add_custom_cert",
    {
      title: "Add a custom PEM certificate",
      description: "Upload a custom certificate and private key to Lucky. Prefer lucky_bind_cert for Let's Encrypt certs that already exist in Lucky.",
      inputSchema: {
        name: z.string().min(1),
        domains: z.array(z.string().min(1)).min(1),
        cert_pem: z.string().min(1),
        key_pem: z.string().min(1),
        enabled: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) =>
      runTool(() =>
        addCustomCert(http, {
          name: args.name,
          domains: args.domains,
          certPem: args.cert_pem,
          keyPem: args.key_pem,
          enabled: args.enabled,
        }),
      ),
  );

  server.registerTool(
    "lucky_sync_cert",
    {
      title: "Trigger Lucky certificate sync",
      description: "Trigger ACME/manual sync for an existing certificate key.",
      inputSchema: { key: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => runTool(() => syncCert(http, args.key)),
  );
}


