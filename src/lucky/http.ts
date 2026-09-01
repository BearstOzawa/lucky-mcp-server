import { Agent, fetch as undiciFetch } from "undici";
import type { Env } from "../env.js";
import { LuckyError, LuckyHttpError } from "../lib/errors.js";
import { redactSecrets } from "../lib/redact.js";
import { unwrapLucky } from "./envelope.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface LuckyRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  unwrap?: boolean;
}

export class LuckyHttp {
  readonly baseUrl: URL;
  private readonly openToken: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;
  private readonly dispatcher: Agent;

  constructor(env: Env) {
    this.baseUrl = new URL(env.baseUrl.endsWith("/") ? env.baseUrl : `${env.baseUrl}/`);
    this.openToken = env.openToken;
    this.timeoutMs = env.timeoutMs;
    this.debug = env.debug;
    this.dispatcher = new Agent({
      connect: { rejectUnauthorized: env.tlsVerify },
    });
  }

  get(path: string, query?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: "GET", path, query });
  }

  put(path: string, body: unknown, query?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: "PUT", path, body, query });
  }

  post(path: string, body: unknown, query?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: "POST", path, body, query });
  }

  delete(path: string, query?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: "DELETE", path, query });
  }

  async request(request: LuckyRequest): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        return await this.send(request);
      } catch (error) {
        lastError = error;
        const retryable =
          (error instanceof LuckyHttpError && error.status === 429) ||
          (error instanceof LuckyError && error.code === "timeout");
        if (!retryable || attempt === 4) {
          throw error;
        }
        await delay(1000 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new LuckyError(String(lastError), "network");
  }

  private async send(request: LuckyRequest): Promise<unknown> {
    const path = request.path.startsWith("/") ? request.path.slice(1) : request.path;
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new LuckyError("Cross-origin Lucky API requests are not allowed", "security");
    }
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    if (this.debug) {
      console.error(`[lucky-mcp] ${request.method} ${url.pathname}${url.search}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await undiciFetch(url, {
        method: request.method,
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": "lucky-mcp-server/0.1.2",
          openToken: this.openToken,
          ...(request.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const rawText = await response.text();
      const parsed = parseBody(rawText, contentType);

      if (!response.ok) {
        throw new LuckyHttpError(
          `Lucky HTTP ${response.status} ${request.method} /${path}: ${stringifyBody(parsed)}`,
          response.status,
          `/${path}`,
        );
      }

      const unwrapped = request.unwrap === false ? parsed : unwrapLucky(parsed);
      return redactSecrets(unwrapped);
    } catch (error) {
      if (error instanceof LuckyError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new LuckyError(`Lucky request timed out after ${this.timeoutMs}ms: /${path}`, "timeout");
      }
      throw new LuckyError(
        `Lucky request failed: /${path}: ${error instanceof Error ? error.message : String(error)}`,
        "network",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBody(text: string, contentType: string): unknown {
  if (!text) {
    return null;
  }
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringifyBody(value: unknown): string {
  const redacted = redactSecrets(value);
  if (typeof redacted === "string") {
    return redacted.slice(0, 500);
  }
  try {
    return JSON.stringify(redacted).slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}
