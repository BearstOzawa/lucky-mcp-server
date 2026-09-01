export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function actualKey(
  object: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  const keys = Object.keys(object);
  for (const name of names) {
    const found = keys.find((key) => key.toLowerCase() === name.toLowerCase());
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function getField(object: Record<string, unknown>, names: readonly string[]): unknown {
  const key = actualKey(object, names);
  return key === undefined ? undefined : object[key];
}

export function setField(
  object: Record<string, unknown>,
  names: readonly string[],
  value: unknown,
): void {
  const existing = actualKey(object, names);
  const preferred = names[0];
  if (!preferred) {
    throw new Error("setField requires at least one field name");
  }
  object[existing ?? preferred] = value;
}

export function getString(object: Record<string, unknown>, names: readonly string[]): string | undefined {
  const value = getField(object, names);
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function getBoolean(object: Record<string, unknown>, names: readonly string[]): boolean | undefined {
  const value = getField(object, names);
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === 0 || value === "0" || value === "false") {
    return false;
  }
  return undefined;
}

export function getNumber(object: Record<string, unknown>, names: readonly string[]): number | undefined {
  const value = getField(object, names);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function getStringArray(object: Record<string, unknown>, names: readonly string[]): string[] {
  const value = getField(object, names);
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
