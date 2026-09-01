export interface CompactRoute {
  key: string;
  name: string;
  enable: boolean;
  type: string;
  domains: string[];
  backend?: string;
  reverseProxy: boolean;
  http_client_timeout?: number;
}

export interface CompactRule {
  key: string;
  name: string;
  enable: boolean;
  listenIp: string;
  listenPort: number;
  tls: boolean;
  network: string;
  certKey?: string;
  routes: CompactRoute[];
}

export interface NativeRuleRef {
  compact: CompactRule;
  native: Record<string, unknown>;
}

export interface ExposeInput {
  domain: string;
  backend: string;
  name?: string;
  ruleKey?: string;
  listenPort?: number;
  enabled?: boolean;
  basicAuthUser?: string;
  basicAuthPassword?: string;
  insecureBackendTls?: boolean;
  httpClientTimeout?: number;
}

export interface ExposeResult {
  action: "created" | "updated";
  domain: string;
  backend: string;
  public_url: string;
  rule: {
    key: string;
    name: string;
    listen_port: number;
    tls: boolean;
  };
  route: CompactRoute;
  hint: string;
}

export interface UnexposeResult {
  action: "removed" | "missing";
  domain: string;
  rule_key?: string;
  route_key?: string;
}

export const RULE_KEY_FIELDS = ["RuleKey", "Key", "id", "ID"] as const;
export const RULE_NAME_FIELDS = ["RuleName", "Name", "name"] as const;
export const ENABLE_FIELDS = ["Enable", "enable", "enabled", "Enabled"] as const;
export const LISTEN_PORT_FIELDS = ["ListenPort", "listenPort", "Port", "port"] as const;
export const LISTEN_IP_FIELDS = ["ListenIP", "ListenHost", "listenIP", "listenHost"] as const;
export const TLS_FIELDS = ["EnableTLS", "TLS", "tls", "EnableHttps", "HTTPS"] as const;
export const NETWORK_FIELDS = ["Network", "network"] as const;
export const ROUTE_LIST_FIELDS = [
  "ProxyList",
  "proxyList",
  "SubRuleList",
  "subRuleList",
  "SubRules",
  "subRules",
  "Routes",
] as const;
export const ROUTE_KEY_FIELDS = ["Key", "key", "id", "ID"] as const;
export const ROUTE_NAME_FIELDS = ["Remark", "Remarks", "Name", "RuleName", "notes"] as const;
export const DOMAIN_FIELDS = ["Domains", "domains", "Hosts", "ServerNames"] as const;
export const LOCATION_FIELDS = ["Locations", "locations"] as const;
export const BACKEND_FIELDS = [
  "ProxyPass",
  "proxyPass",
  "Target",
  "Backend",
  "ReverseURL",
  "TargetURL",
  "BackendURL",
] as const;
export const TYPE_FIELDS = ["WebServiceType", "webServiceType", "ProxyType", "proxyType", "Type", "RuleType", "type"] as const;
export const BASIC_AUTH_ENABLE_FIELDS = ["EnableBasicAuth", "enableBasicAuth"] as const;
export const BASIC_AUTH_USER_FIELDS = ["BasicAuthUser", "basicAuthUser"] as const;
export const BASIC_AUTH_PASS_FIELDS = ["BasicAuthPasswd", "BasicAuthPassword", "basicAuthPasswd"] as const;
export const INSECURE_TLS_FIELDS = [
  "InsecureSkipVerify",
  "SkipTLSVerify",
  "IgnoreBackendTLS",
  "insecureSkipVerify",
] as const;
export const CERT_KEY_FIELDS = ["CertKey", "SSLCertKey", "SslCertKey", "CertificateKey"] as const;
export const HTTP_CLIENT_TIMEOUT_FIELDS = ["HttpClientTimeout", "httpClientTimeout"] as const;
