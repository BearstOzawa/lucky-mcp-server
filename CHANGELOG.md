# Changelog

## 0.1.2

- Write paths load the full web rule before PUT, so list-payload fields such as `HttpClientTimeout` are not dropped.
- Reverse-proxy routes expose `http_client_timeout`.
- Port forwards use Lucky 3.0 fields (`ListenPorts`, `TargetAddressList`) and the server-assigned key.
- Cron jobs use Lucky 3.0 `Type`/`TypeParams`/`shell_option`.
- HTTP 429 responses are retried.

## 0.1.1

- Parse Lucky 3.0 envelopes (`rule`, `ruleList`, `list: null`).
- Map reverse-proxy `Domains` and `Locations`.
- Compact certificate and DDNS views from `CertsInfo` and `TaskKey`.

## 0.1.0

- Initial release.
