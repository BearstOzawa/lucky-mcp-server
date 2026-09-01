import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 1800;
const WRITE_GAP = 4000;
const TEST_DOMAIN = "mcp-probe.lili.uno";
const TEST_BACKEND = "http://127.0.0.1:9";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/cli.js"],
  env: { ...process.env },
});
const client = new Client({ name: "full-probe", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const results = [];
const called = new Set();
let cronKey;
let pfKey;

function preview(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").slice(0, 220);
}

async function call(name, args = {}, { write = false, required = false } = {}) {
  await sleep(write ? WRITE_GAP : GAP);
  called.add(name);
  try {
    const result = await client.callTool({ name, arguments: args });
    const raw = result.content?.[0] && "text" in result.content[0] ? result.content[0].text : JSON.stringify(result);
    const ok = !result.isError && !/You have reached maximum request limit/.test(raw);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    results.push({ name, ok, write, error: ok ? null : preview(raw), preview: preview(data) });
    if (!ok && required) {
      throw new Error(raw.slice(0, 400));
    }
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!results.some((row) => row.name === name && row.error === preview(message))) {
      results.push({ name, ok: false, write, error: preview(message), preview: preview(message) });
    }
    if (required) {
      throw error;
    }
    return null;
  }
}

async function retry(fn, times = 4) {
  let last;
  for (let i = 1; i <= times; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const message = String(error);
      if (!/429|999|fetch failed|network|timed out/i.test(message) || i === times) {
        throw error;
      }
      await sleep(2000 * i);
    }
  }
  throw last;
}

const listed = await client.listTools();
const allNames = listed.tools.map((tool) => tool.name);

try {
  await call("lucky_status");
  const rules = await call("lucky_list_web_rules");
  const https = (rules?.rules || []).find((rule) => rule.tls && rule.listenPort === 11443);
  if (https?.key) {
    await call("lucky_get_web_rule", { rule_key: https.key });
  }
  await call("lucky_web_logs", { domain: "outline.lili.uno", limit: 5 });
  await call("lucky_list_certs");
  await call("lucky_list_port_forwards");
  const ddns = await call("lucky_list_ddns");
  if (ddns?.tasks?.[0]?.key) {
    await call("lucky_get_ddns", { key: ddns.tasks[0].key });
    await call("lucky_ddns_logs", { limit: 5 });
  }
  const stun = await call("lucky_list_stun_rules");
  if (stun?.rules?.[0]?.key) {
    await call("lucky_stun_logs", { key: stun.rules[0].key, limit: 5 });
  }
  await call("lucky_list_wol_devices");
  await call("lucky_get_settings");
  await call("lucky_list_cron_jobs");
  await call("lucky_cron_logs", { limit: 5 });
  await call("lucky_get_ftp");
  await call("lucky_ftp_logs", { limit: 5 });
  await call("lucky_get_webdav");
  await call("lucky_webdav_logs", { limit: 5 });
  await call("lucky_list_docker");
  const filters = await call("lucky_list_ip_filters");
  if (filters?.rules?.[0]?.key) {
    await call("lucky_get_ip_filter", { key: filters.rules[0].key });
  }
  await call("lucky_list_blocked_ips");
  await call("lucky_ip_filter_logs", { limit: 5 });
  await call("lucky_list_security_groups");
  await call("lucky_list_auth_providers");
  await call("lucky_logs_stats");
  await call("lucky_query_logs", { limit: 5 });
  await call("lucky_list_storage");
  await call("lucky_list_local_paths");
  await call("lucky_host_status");
  await call("lucky_list_tunnels");
  await call("lucky_query_ip", { ip: "1.1.1.1" });
  await call("lucky_list_terminal_connections");
  await call("lucky_api_catalog");
  await call("lucky_api_call", { method: "GET", path: "/version" });

  if (https?.key) {
    await retry(() =>
      call(
        "lucky_expose_service",
        { domain: TEST_DOMAIN, backend: TEST_BACKEND, name: "mcp-probe", http_client_timeout: 30 },
        { write: true, required: true },
      ),
    );
    await retry(() =>
      call("lucky_set_route_enabled", { domain: TEST_DOMAIN, enabled: false }, { write: true, required: true }),
    );
    await retry(() =>
      call("lucky_set_route_enabled", { domain: TEST_DOMAIN, enabled: true }, { write: true, required: true }),
    );
    const afterExpose = await call("lucky_get_web_rule", { rule_key: https.key });
    const probeRoute = (afterExpose?.routes || []).find((route) => (route.domains || []).includes(TEST_DOMAIN));
    results.push({
      name: "verify_probe_route",
      ok: Boolean(probeRoute?.enable && probeRoute?.http_client_timeout === 30),
      write: false,
      error: probeRoute ? null : "probe route missing",
      preview: preview(probeRoute || afterExpose?.routes?.map((route) => route.name)),
    });
    await retry(() => call("lucky_unexpose_service", { domain: TEST_DOMAIN }, { write: true, required: true }));
  }

  const pf = await retry(() =>
    call(
      "lucky_upsert_port_forward",
      {
        name: "mcp-probe",
        listen_port: 39991,
        target_ip: "127.0.0.1",
        target_port: 39991,
        protocol: "tcp",
        enabled: false,
      },
      { write: true, required: true },
    ),
  );
  pfKey = pf?.forward?.key;
  if (pfKey) {
    await call("lucky_port_forward_logs", { key: pfKey, limit: 5 });
    await retry(() =>
      call("lucky_set_port_forward_enabled", { key: pfKey, enabled: false }, { write: true, required: true }),
    );
    await retry(() => call("lucky_delete_port_forward", { key: pfKey }, { write: true, required: true }));
    pfKey = undefined;
  }

  const cron = await retry(() =>
    call(
      "lucky_upsert_cron_job",
      { name: "mcp-probe", expression: "0 0 1 1 *", command: "true", type: "shell", enabled: false },
      { write: true, required: true },
    ),
  );
  cronKey = cron?.job?.key;
  if (cronKey) {
    await retry(() => call("lucky_set_cron_enabled", { key: cronKey, enabled: false }, { write: true, required: true }));
    await retry(() => call("lucky_delete_cron_job", { key: cronKey }, { write: true, required: true }));
    cronKey = undefined;
  }
} finally {
  try {
    await sleep(WRITE_GAP);
    await client.callTool({ name: "lucky_unexpose_service", arguments: { domain: TEST_DOMAIN } });
  } catch {
    /* cleanup */
  }
  try {
    if (pfKey) {
      await sleep(GAP);
      await client.callTool({ name: "lucky_delete_port_forward", arguments: { key: pfKey } });
    }
  } catch {
    /* cleanup */
  }
  try {
    if (cronKey) {
      await sleep(GAP);
      await client.callTool({ name: "lucky_delete_cron_job", arguments: { key: cronKey } });
    }
  } catch {
    /* cleanup */
  }
  await client.close();
}

const skipped = [
  "lucky_bind_cert",
  "lucky_add_custom_cert",
  "lucky_sync_cert",
  "lucky_set_ddns_enabled",
  "lucky_sync_ddns",
  "lucky_set_stun_enabled",
  "lucky_wake",
  "lucky_add_wol_device",
  "lucky_update_ftp",
  "lucky_update_webdav",
  "lucky_set_storage_enabled",
  "lucky_upsert_terminal_connection",
  "lucky_run_cron_job",
  "lucky_unblock_ip",
];

const report = {
  tools_registered: allNames.length,
  passed: results.filter((row) => row.ok).length,
  failed: results.filter((row) => !row.ok),
  tools_skipped_destructive: skipped.filter((name) => allNames.includes(name)),
  tools_never_called: allNames.filter((name) => !called.has(name) && !skipped.includes(name)),
  results,
};
console.log(JSON.stringify(report, null, 2));
if (report.failed.length) {
  process.exit(1);
}
