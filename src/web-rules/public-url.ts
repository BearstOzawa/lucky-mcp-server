export function publicUrl(domain: string, port: number, tls: boolean): string {
  const scheme = tls ? "https" : "http";
  const omitPort = (tls && port === 443) || (!tls && port === 80);
  return omitPort ? `${scheme}://${domain}` : `${scheme}://${domain}:${port}`;
}

export function exposeHint(backend: string): string {
  return `If Lucky returns 502, confirm ${backend} is listening and reachable from the Lucky host. Use 127.0.0.1 when they share a machine.`;
}
