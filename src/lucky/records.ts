import { randomBytes } from "node:crypto";
import { LuckyError, LuckyHttpError } from "../lib/errors.js";
import {
  cloneJson,
  getBoolean,
  getNumber,
  getString,
  getStringArray,
  isRecord,
  setField,
} from "../lib/object-fields.js";
import { extractObjectList } from "./envelope.js";
import type { LuckyHttp } from "./http.js";

export const KEY_FIELDS = ["Key", "RuleKey", "TaskKey", "key", "id", "ID"] as const;
export const NAME_FIELDS = ["Name", "RuleName", "CertName", "TaskName", "Remark"] as const;
export const ENABLE_FIELDS = ["Enable", "enable", "enabled", "Enabled"] as const;

export interface QueryResource {
  listPaths: string[];
  itemPath: string;
  getPath?: string;
  enablePath?: string;
}

export function identity(native: Record<string, unknown>): {
  key: string;
  name: string;
  enable: boolean;
} {
  return {
    key: getString(native, KEY_FIELDS) ?? "",
    name: getString(native, NAME_FIELDS) ?? "",
    enable: getBoolean(native, ENABLE_FIELDS) ?? true,
  };
}

export async function loadList(http: LuckyHttp, paths: string[]): Promise<Record<string, unknown>[]> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return extractObjectList(await http.get(path));
    } catch (error) {
      lastError = error;
      if (error instanceof LuckyHttpError && (error.status === 404 || error.status === 405)) {
        continue;
      }
      throw error;
    }
  }
  if (lastError instanceof LuckyError) {
    throw lastError;
  }
  return [];
}

export async function loadByKey(
  http: LuckyHttp,
  resource: QueryResource,
  key: string,
): Promise<Record<string, unknown>> {
  if (resource.getPath) {
    try {
      const payload = await http.get(resource.getPath.replace("{key}", encodeURIComponent(key)));
      if (isRecord(payload)) {
        return payload;
      }
    } catch (error) {
      if (!(error instanceof LuckyHttpError) || (error.status !== 404 && error.status !== 405)) {
        throw error;
      }
    }
  }

  const list = await loadList(http, resource.listPaths);
  const match = list.find((item) => identity(item).key === key);
  if (!match) {
    throw new LuckyError(`Lucky record not found: ${key}`, "not_found");
  }
  return match;
}

export async function saveRecord(
  http: LuckyHttp,
  resource: QueryResource,
  native: Record<string, unknown>,
  isCreate: boolean,
): Promise<unknown> {
  const key = identity(native).key;
  if (isCreate) {
    const created = await http.post(resource.itemPath, native);
    const createdKey = isRecord(created) ? getString(created, KEY_FIELDS) : undefined;
    if (createdKey) {
      try {
        return await loadByKey(http, resource, createdKey);
      } catch {
        return created;
      }
    }
    return created;
  }
  const pathKey = resource.getPath?.replace("{key}", encodeURIComponent(key));
  if (pathKey && resource.getPath !== resource.itemPath) {
    try {
      return await http.put(pathKey, native);
    } catch (error) {
      if (!(error instanceof LuckyHttpError) || (error.status !== 404 && error.status !== 405)) {
        throw error;
      }
    }
  }
  return http.put(resource.itemPath, native, { key });
}

export async function deleteRecord(http: LuckyHttp, resource: QueryResource, key: string): Promise<unknown> {
  const pathKey = resource.getPath?.replace("{key}", encodeURIComponent(key));
  if (pathKey && resource.getPath !== resource.itemPath) {
    try {
      return await http.delete(pathKey);
    } catch (error) {
      if (!(error instanceof LuckyHttpError) || (error.status !== 404 && error.status !== 405)) {
        throw error;
      }
    }
  }
  return http.delete(resource.itemPath, { key });
}

export async function setRecordEnabled(
  http: LuckyHttp,
  resource: QueryResource,
  key: string,
  enabled: boolean,
): Promise<Record<string, unknown>> {
  if (resource.enablePath) {
    try {
      await http.get(resource.enablePath, { key, enable: enabled });
      return loadByKey(http, resource, key);
    } catch (error) {
      if (!(error instanceof LuckyHttpError) || (error.status !== 404 && error.status !== 405)) {
        throw error;
      }
    }
  }
  const native = cloneJson(await loadByKey(http, resource, key));
  setField(native, ENABLE_FIELDS, enabled);
  await saveRecord(http, resource, native, false);
  return native;
}

export function newKey(existing: Record<string, unknown>[]): string {
  const used = new Set(existing.map((item) => identity(item).key).filter(Boolean));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const key = randomBytes(8).toString("hex");
    if (!used.has(key)) {
      return key;
    }
  }
  throw new LuckyError("unable to allocate a unique key", "internal");
}

export function sliceLogs(payload: unknown, limit: number): unknown {
  if (Array.isArray(payload)) {
    return payload.slice(-limit);
  }
  if (typeof payload === "string") {
    return payload.split(/\r?\n/).filter(Boolean).slice(-limit);
  }
  if (isRecord(payload)) {
    for (const key of ["logs", "Logs", "list", "List", "data", "Data"]) {
      const inner = payload[key];
      if (Array.isArray(inner)) {
        return { ...payload, [key]: inner.slice(-limit) };
      }
    }
  }
  return payload;
}

export function readNumber(native: Record<string, unknown>, names: readonly string[], fallback = 0): number {
  return getNumber(native, names) ?? fallback;
}

export function readStrings(native: Record<string, unknown>, names: readonly string[]): string[] {
  return getStringArray(native, names);
}

export async function findByName(
  http: LuckyHttp,
  resource: QueryResource,
  name: string,
): Promise<Record<string, unknown> | undefined> {
  const list = await loadList(http, resource.listPaths);
  return list.find((item) => identity(item).name === name);
}
