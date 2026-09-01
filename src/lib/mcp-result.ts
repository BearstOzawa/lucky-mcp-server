import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { redactSecrets } from "./redact.js";

export function asJson(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(redactSecrets(value), null, 2),
      },
    ],
  };
}

export function asToolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return asJson(await fn());
  } catch (error) {
    return asToolError(error);
  }
}
