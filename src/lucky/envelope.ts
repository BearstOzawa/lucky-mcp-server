import { LuckyError } from "../lib/errors.js";
import { isRecord } from "../lib/object-fields.js";

export function unwrapLucky(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const ret = payload.ret ?? payload.Ret ?? payload.code ?? payload.errcode;
  const msg = payload.msg ?? payload.Msg ?? payload.message ?? payload.errmsg;
  if (typeof ret === "number" && ret !== 0 && ret !== 200) {
    throw new LuckyError(`Lucky API error (ret=${ret}): ${stringifyMsg(msg)}`, "api");
  }
  if (typeof ret === "string") {
    const normalized = ret.trim().toLowerCase();
    if (normalized && normalized !== "0" && normalized !== "ok" && normalized !== "success") {
      throw new LuckyError(`Lucky API error (${ret}): ${stringifyMsg(msg)}`, "api");
    }
  }

  if ("data" in payload && payload.data !== undefined) {
    return payload.data;
  }
  if ("Data" in payload && payload.Data !== undefined) {
    return payload.Data;
  }
  if (isRecord(payload.rule)) {
    return payload.rule;
  }
  if (Array.isArray(payload.ruleList)) {
    return payload.ruleList;
  }
  if (Array.isArray(payload.RuleList)) {
    return payload.RuleList;
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  return payload;
}

export function extractObjectList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }

  const nestedKeys = [
    "list",
    "List",
    "ruleList",
    "RuleList",
    "rules",
    "Rules",
    "items",
    "Items",
    "data",
    "Data",
    "ReverseProxyRuleList",
    "WebServiceRules",
    "PortForwards",
    "SSLCerts",
    "CertList",
    "DDNSTaskList",
    "Tasks",
    "WOLDevices",
    "Devices",
    "StunRuleList",
  ];
  for (const key of nestedKeys) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const inner = value[key];
    if (inner == null) {
      return [];
    }
    if (Array.isArray(inner)) {
      return inner.filter(isRecord);
    }
  }
  if (value.ret !== undefined || value.Ret !== undefined) {
    return [];
  }
  return [value];
}

function stringifyMsg(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (value === undefined || value === null) {
    return "unknown error";
  }
  return JSON.stringify(value);
}
