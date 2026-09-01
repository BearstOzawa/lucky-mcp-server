const secretKey = /password|passwd|secret|token|authorization|cookie|private.?key/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      secretKey.test(key) ? "[REDACTED]" : redactSecrets(nested),
    ]),
  );
}
