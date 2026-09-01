import { afterEach, describe, expect, it } from "vitest";
import { addCustomCert, listCerts } from "../src/certs.js";
import { getDdns, listDdns } from "../src/ddns.js";
import { loadEnv } from "../src/env.js";
import { LuckyHttp } from "../src/lucky/http.js";
import { listPortForwards, upsertPortForward } from "../src/port-forwards.js";
import { listStunRules } from "../src/stun.js";
import { bindCert } from "../src/web-rules/operations.js";
import { addWolDevice, listWolDevices, wakeDevice } from "../src/wol.js";
import { startFakeLucky, type FakeLucky } from "./fake-lucky.js";

const fakes: FakeLucky[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
});

describe("certs, port forwards, ddns, stun, wol", () => {
  it("lists certs without leaking PEM and binds a cert to the TLS listener", async () => {
    const { env, http } = await boot();
    const certs = await listCerts(http);
    expect(certs[0]?.key).toBe("cert-1");
    expect(JSON.stringify(certs)).not.toContain("BEGIN PRIVATE KEY");

    const bound = await bindCert(http, env, { certKey: "cert-1", listenPort: 16666 });
    expect(bound.rule.tls).toBe(true);
    expect(bound.rule.certKey).toBe("cert-1");

    const added = await addCustomCert(http, {
      name: "lab",
      domains: ["lab.example.com"],
      certPem: "-----BEGIN CERTIFICATE-----\nabc",
      keyPem: "-----BEGIN PRIVATE KEY-----\ndef",
    });
    expect(added.name).toBe("lab");
    expect(added.has_material).toBe(true);
  });

  it("upserts port forwards by listen port", async () => {
    const { http } = await boot();
    const listed = await listPortForwards(http);
    expect(listed[0]?.listen_port).toBe(25565);

    const updated = await upsertPortForward(http, {
      listenPort: 25565,
      targetIp: "192.168.1.20",
      targetPort: 25565,
      protocol: "tcp",
      name: "mc",
    });
    expect(updated.action).toBe("updated");
    expect(updated.forward.target_ip).toBe("192.168.1.20");

    const created = await upsertPortForward(http, {
      listenPort: 22,
      targetIp: "192.168.1.10",
      targetPort: 22,
      protocol: "tcp",
      name: "ssh",
    });
    expect(created.action).toBe("created");
    expect(created.forward.listen_port).toBe(22);
  });

  it("lists DDNS without leaking tokens and wakes WOL devices by name", async () => {
    const { http, fake } = await boot();
    const tasks = await listDdns(http);
    expect(tasks[0]?.domains).toContain("home.example.com");
    const detail = await getDdns(http, "ddns-1");
    expect(detail.provider).toBe("cloudflare");

    const stun = await listStunRules(http);
    expect(stun[0]?.public_addr).toBe("8.8.8.8:12345");

    const devices = await listWolDevices(http);
    expect(devices[0]?.mac).toBe("aa:bb:cc:dd:ee:ff");
    await wakeDevice(http, { name: "NAS" });
    expect(fake.lastWake?.key).toBe("nas");

    const added = await addWolDevice(http, { name: "PC", mac: "AA-BB-CC-11-22-33" });
    expect(added.mac).toBe("aa:bb:cc:11:22:33");
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
