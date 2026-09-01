import { describe, expect, it } from "vitest";
import { compactCron } from "../src/cron.js";
import { compactPortForward } from "../src/port-forwards.js";

describe("Lucky 3.0 module compact views", () => {
  it("reads ListenPorts and TargetAddressList", () => {
    expect(
      compactPortForward({
        Key: "abc",
        Name: "mcp-probe",
        Enable: true,
        ListenAddress: "0.0.0.0",
        ListenPorts: "39991",
        TargetAddressList: ["127.0.0.1"],
        TargetPorts: "39991",
        ForwardTypes: ["tcp"],
      }),
    ).toMatchObject({
      key: "abc",
      name: "mcp-probe",
      listen_port: 39991,
      target_ip: "127.0.0.1",
      target_port: 39991,
      protocol: "tcp",
    });
  });

  it("reads Type 7 TypeParams and shell_option jobs", () => {
    expect(
      compactCron({
        Key: "job1",
        Name: "mcp-probe",
        Enable: true,
        Type: 7,
        TypeParams: "0 0 1 1 *",
        Jobs: [{ Type: "shell_option", Remark: "mcp", Options: { shell_content: "true" } }],
      }),
    ).toMatchObject({
      key: "job1",
      name: "mcp-probe",
      expression: "0 0 1 1 *",
      command: "true",
      type: "7",
    });
  });
});
