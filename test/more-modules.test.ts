import { afterEach, describe, expect, it } from "vitest";
import { listCronJobs, upsertCronJob } from "../src/cron.js";
import { loadEnv } from "../src/env.js";
import { LuckyHttp } from "../src/lucky/http.js";
import { compactFilter } from "../src/ip-filter.js";
import { loadList } from "../src/lucky/records.js";
import { compactConnection } from "../src/web-terminal.js";
import { startFakeLucky, type FakeLucky } from "./fake-lucky.js";

const fakes: FakeLucky[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
});

describe("remaining Lucky modules", () => {
  it("upserts cron jobs by name and lists FTP without leaking passwords in compact docker lists", async () => {
    const { http } = await boot();
    const jobs = await listCronJobs(http);
    expect(jobs[0]?.name).toBe("backup");

    const updated = await upsertCronJob(http, {
      name: "backup",
      expression: "0 4 * * *",
      command: "echo later",
    });
    expect(updated.action).toBe("updated");
    expect(updated.job.expression).toBe("0 4 * * *");

    const created = await upsertCronJob(http, {
      name: "cleanup",
      expression: "0 5 * * *",
      command: "rm -rf /tmp/x",
    });
    expect(created.action).toBe("created");

    const ftp = await http.get("/api/ftpserver/configure");
    expect(JSON.stringify(ftp)).toContain("[REDACTED]");

    const docker = await http.get("/api/docker/containers");
    expect(docker).toEqual([{ Name: "outline", State: "running" }]);
  });

  it("lists IP filters, storage, terminals, and can unblock an IP", async () => {
    const { http } = await boot();
    const filters = (await loadList(http, ["/api/ipfliter/listlite"])).map(compactFilter);
    expect(filters[0]?.mode).toBe("black");

    await http.delete("/api/ipfliter/porttrap/blockedips/1.2.3.4");
    const blocked = await http.get("/api/ipfliter/porttrap/blockedips");
    expect(blocked).toEqual([]);

    const connections = (await loadList(http, ["/api/webterminal/connections"])).map(compactConnection);
    expect(connections[0]).toMatchObject({ name: "router", host: "192.168.1.1", port: 22 });
  });
});

async function boot() {
  const fake = await startFakeLucky();
  fakes.push(fake);
  const env = loadEnv({
    LUCKY_BASE_URL: fake.baseUrl,
    LUCKY_OPEN_TOKEN: "test-token",
  });
  return { fake, env, http: new LuckyHttp(env) };
}
