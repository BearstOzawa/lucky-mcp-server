export function sampleHttpsRule() {
  return {
    RuleKey: "listener-https",
    RuleName: "HTTPS",
    Enable: true,
    ListenIP: "0.0.0.0",
    ListenPort: 16666,
    EnableTLS: true,
    Network: "tcp4",
    ProxyList: [
      {
        Key: "route-wiki",
        Enable: true,
        Locations: ["wiki.example.com"],
        ProxyPass: "http://127.0.0.1:3000",
        ProxyType: "reverseproxy",
        Remark: "wiki",
        EnableAccessLog: true,
        LogLevel: 4,
        AccessLogMaxNum: 500,
        EnableBasicAuth: false,
      },
      {
        Key: "route-redirect",
        Enable: true,
        Locations: ["old.example.com"],
        ProxyType: "redirect",
        RedirectURL: "https://wiki.example.com",
        Remark: "old",
      },
    ],
  };
}

export function sampleHttpRule() {
  return {
    RuleKey: "listener-http",
    RuleName: "HTTP",
    Enable: true,
    ListenIP: "0.0.0.0",
    ListenPort: 80,
    EnableTLS: false,
    Network: "tcp4",
    ProxyList: [],
  };
}

export function camelCaseRule() {
  return {
    key: "listener-camel",
    name: "camel",
    enable: true,
    listenPort: 443,
    tls: true,
    proxyList: [
      {
        key: "r1",
        enable: true,
        locations: ["app.example.com"],
        proxyPass: "http://127.0.0.1:8080",
        proxyType: "reverseproxy",
        remark: "app",
      },
    ],
  };
}
