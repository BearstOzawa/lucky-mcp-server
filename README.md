# @bearst/lucky-mcp-server

中文 | [English](#english)

Lucky 的 MCP Server。通过 OpenToken 调用 Lucky 3.0 HTTP API，以 stdio 提供反向代理、证书、端口转发、DDNS 及相关模块的工具。

## 要求

- Node.js 20 或更高
- 已启用 OpenToken 的 Lucky 实例（管理端口默认 `16601`）

认证请求头为 `openToken`。不使用账号密码，也不维持登录会话。

## 安装

```bash
npx -y @bearst/lucky-mcp-server
```

MCP 客户端配置：

```json
{
  "mcpServers": {
    "lucky": {
      "command": "npx",
      "args": ["-y", "@bearst/lucky-mcp-server"],
      "env": {
        "LUCKY_BASE_URL": "http://127.0.0.1:16601",
        "LUCKY_OPEN_TOKEN": "<open-token>"
      }
    }
  }
}
```

从本地构建运行时，将 `command` 设为 `node`，`args` 设为 `["/path/to/lucky-mcp-server/dist/cli.js"]`。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `LUCKY_BASE_URL` | 是 | — | Lucky 管理端根 URL |
| `LUCKY_OPEN_TOKEN` | 是 | — | OpenToken |
| `LUCKY_TLS_VERIFY` | 否 | `true` | 校验 Lucky HTTPS 证书。自签证书设为 `false` |
| `LUCKY_TIMEOUT_MS` | 否 | `15000` | 请求超时（毫秒） |
| `LUCKY_DEFAULT_RULE_KEY` | 否 | — | `lucky_expose_service` 默认使用的 Web 监听 key |
| `LUCKY_DEFAULT_LISTEN_PORT` | 否 | — | `lucky_expose_service` 默认使用的监听端口 |
| `LUCKY_ALLOWED_DOMAIN_SUFFIX` | 否 | — | 允许写入的域名后缀，逗号分隔 |
| `LUCKY_DEBUG` | 否 | — | 向 stderr 输出请求路径，不输出 token |

OpenToken 在 Lucky 设置中签发。请遵守 Lucky 对 OpenToken 的使用条款。

## 工具

列表类工具返回压缩后的字段，不返回 Lucky 原生完整对象。密钥类字段在响应中脱敏。

### 反向代理

| 工具 | 说明 |
|---|---|
| `lucky_status` | 连通性、版本、模块与当前 MCP 配置 |
| `lucky_list_web_rules` | Web 监听及其子规则（端口、TLS、域名、后端） |
| `lucky_get_web_rule` | 按 key 读取一条监听 |
| `lucky_expose_service` | 按域名将后端挂到已有监听；已存在则更新后端 |
| `lucky_unexpose_service` | 按域名删除子规则，不删除监听 |
| `lucky_set_route_enabled` | 启用或停用指定域名的子规则 |
| `lucky_web_logs` | 反代访问日志 |

`lucky_expose_service` 选择监听的顺序：`rule_key` → `listen_port` → `LUCKY_DEFAULT_RULE_KEY` → `LUCKY_DEFAULT_LISTEN_PORT` → 已启用的 TLS 监听（优先端口 443）。不会创建新的监听端口。

新增子规则时复制同一监听上已有的反向代理规则，并改写域名与后端。目标监听没有任何反向代理子规则时，提交 PascalCase 最小对象。

### 证书

| 工具 | 说明 |
|---|---|
| `lucky_list_certs` | 证书元数据（不含私钥与 PEM） |
| `lucky_get_cert` | 按 key 读取证书元数据 |
| `lucky_bind_cert` | 将已有证书绑定到 Web 监听并启用 TLS |
| `lucky_add_custom_cert` | 上传自定义 PEM |
| `lucky_sync_cert` | 触发指定证书的 ACME / 手动同步 |

### 端口转发

| 工具 | 说明 |
|---|---|
| `lucky_list_port_forwards` | 端口转发列表 |
| `lucky_upsert_port_forward` | 按监听端口与协议创建或更新 |
| `lucky_delete_port_forward` | 按 key 删除 |
| `lucky_set_port_forward_enabled` | 启用或停用 |
| `lucky_port_forward_logs` | 日志 |

### DDNS

| 工具 | 说明 |
|---|---|
| `lucky_list_ddns` | 任务列表（提供商、域名、最近 IP） |
| `lucky_get_ddns` | 按 key 读取任务 |
| `lucky_set_ddns_enabled` | 启用或停用 |
| `lucky_sync_ddns` | 立即同步 |
| `lucky_ddns_logs` | 日志 |

创建新任务需要提供商专用字段，请使用 `lucky_api_call`。

### STUN / WOL / 设置

| 工具 | 说明 |
|---|---|
| `lucky_list_stun_rules` | STUN 规则 |
| `lucky_set_stun_enabled` | 启用或停用 STUN 规则 |
| `lucky_stun_logs` | STUN 日志 |
| `lucky_list_wol_devices` | WOL 设备 |
| `lucky_wake` | 按 key、名称或 MAC 发送魔术包 |
| `lucky_add_wol_device` | 添加设备 |
| `lucky_get_settings` | 读取基础设置（密钥脱敏） |

### 计划任务

| 工具 | 说明 |
|---|---|
| `lucky_list_cron_jobs` | 任务列表 |
| `lucky_upsert_cron_job` | 按名称（或 key）创建或更新 |
| `lucky_delete_cron_job` | 按 key 删除 |
| `lucky_set_cron_enabled` | 启用或停用 |
| `lucky_run_cron_job` | 立即执行 |
| `lucky_cron_logs` | 日志 |

### FTP / WebDAV

| 工具 | 说明 |
|---|---|
| `lucky_get_ftp` / `lucky_get_webdav` | 配置与运行状态 |
| `lucky_update_ftp` / `lucky_update_webdav` | 合并写入配置 |
| `lucky_ftp_logs` / `lucky_webdav_logs` | 日志 |

### Docker

| 工具 | 说明 |
|---|---|
| `lucky_list_docker` | 容器、镜像、卷、Compose 项目（只读） |

### IP 过滤

| 工具 | 说明 |
|---|---|
| `lucky_list_ip_filters` | 过滤规则 |
| `lucky_get_ip_filter` | 按 key 读取规则 |
| `lucky_list_blocked_ips` | 端口诱捕已封禁 IP |
| `lucky_unblock_ip` | 解除封禁 |
| `lucky_ip_filter_logs` | 日志 |

### 安全组

| 工具 | 说明 |
|---|---|
| `lucky_list_security_groups` | 安全组、授权与用户（只读） |
| `lucky_list_auth_providers` | 第三方认证配置（只读） |

### 日志、存储、主机

| 工具 | 说明 |
|---|---|
| `lucky_logs_stats` | 日志中心统计、位置与数据流 |
| `lucky_query_logs` | 查询日志中心 |
| `lucky_list_storage` | 存储挂载 |
| `lucky_set_storage_enabled` | 启用或停用挂载 |
| `lucky_list_local_paths` | 浏览 Lucky 可见的本地路径 |
| `lucky_host_status` | 主机与模块状态 |
| `lucky_list_tunnels` | Cloudflared 与 Coraza 实例 |
| `lucky_query_ip` | IP 库查询 |

### Web 终端

| 工具 | 说明 |
|---|---|
| `lucky_list_terminal_connections` | SSH 连接与会话（不含 SFTP） |
| `lucky_upsert_terminal_connection` | 按名称创建或更新连接 |

### 通用 API

| 工具 | 说明 |
|---|---|
| `lucky_api_catalog` | 允许调用的 API 前缀 |
| `lucky_api_call` | 调用前缀白名单内的 Lucky API |

`lucky_api_call` 拒绝以下路径：登录、登出、管理员密码、OpenToken、2FA、配置恢复、进程重启、OAuth 登录、终止主机进程。基础设置仅允许读取。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

```bash
LUCKY_BASE_URL="http://127.0.0.1:16601" \
LUCKY_OPEN_TOKEN="<open-token>" \
npm run dev
```

## 发布

创建 GitHub Release 将触发 `Publish` workflow，发布 `@bearst/lucky-mcp-server`。仓库需配置 `NPM_TOKEN`。Release tag 须与 `package.json` 的 `version` 一致（例如 `v0.1.0`）。

## License

MIT

## English

MCP server for [Lucky](https://lucky666.cn). It authenticates with OpenToken and exposes stdio tools for reverse proxy, certificates, port forwarding, DDNS, and related Lucky 3.0 modules.

### Requirements

- Node.js 20+
- A Lucky instance with OpenToken enabled (admin port defaults to `16601`)

The client sends the token in the `openToken` header. It does not log in with a password or keep a session cookie.

### Install

```bash
npx -y @bearst/lucky-mcp-server
```

```json
{
  "mcpServers": {
    "lucky": {
      "command": "npx",
      "args": ["-y", "@bearst/lucky-mcp-server"],
      "env": {
        "LUCKY_BASE_URL": "http://127.0.0.1:16601",
        "LUCKY_OPEN_TOKEN": "<open-token>"
      }
    }
  }
}
```

To run a local build, set `command` to `node` and `args` to `["/path/to/lucky-mcp-server/dist/cli.js"]`.

### Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `LUCKY_BASE_URL` | yes | — | Lucky admin base URL |
| `LUCKY_OPEN_TOKEN` | yes | — | OpenToken |
| `LUCKY_TLS_VERIFY` | no | `true` | Verify Lucky's TLS certificate. Set `false` for self-signed certs |
| `LUCKY_TIMEOUT_MS` | no | `15000` | Request timeout in milliseconds |
| `LUCKY_DEFAULT_RULE_KEY` | no | — | Default web listener key for `lucky_expose_service` |
| `LUCKY_DEFAULT_LISTEN_PORT` | no | — | Default web listener port for `lucky_expose_service` |
| `LUCKY_ALLOWED_DOMAIN_SUFFIX` | no | — | Comma-separated suffixes allowed for writes |
| `LUCKY_DEBUG` | no | — | Log request paths to stderr; tokens are not logged |

Issue the token in Lucky settings. Follow Lucky's terms for OpenToken.

### Tools

List tools return compact records, not Lucky's full native objects. Secret fields are redacted.

`lucky_expose_service` selects a listener in this order: `rule_key` → `listen_port` → `LUCKY_DEFAULT_RULE_KEY` → `LUCKY_DEFAULT_LISTEN_PORT` → an enabled TLS listener (port 443 preferred). It does not create a new listen port. New reverse-proxy routes are cloned from an existing route on the same listener.

`lucky_api_call` is restricted to allowlisted path prefixes. It rejects login, logout, admin password, OpenToken, 2FA, config restore, process reboot, OAuth login, and host process kill. Base settings are read-only.

See the Chinese section above for the full tool table.

### Development

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

### Publish

A GitHub Release runs the `Publish` workflow. The repository needs `NPM_TOKEN`. The release tag must match `package.json` `version` (for example `v0.1.0`).

### License

MIT
