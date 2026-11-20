# Web and API surface

## Injection

Look for any place a value reaches an interpreter as text.

- **SQL / NoSQL** — string concatenation or interpolation into a query. Includes the parts people
  think are safe: `ORDER BY`, `LIMIT`, table and column names, `IN (...)` lists. Parameter binding
  does not cover identifiers — those need an allowlist.
- **Shell** — a command built from a string. Even with escaping, prefer passing an argument list.
  Watch for `sh -c`, `exec`, backticks, and library helpers that take a full command line.
- **Template engines** — user input rendered as a template rather than as data. Server-side
  template injection is easy to miss and usually means code execution.
- **LDAP, XPath, regular expressions** — same pattern. A regex built from input also risks
  catastrophic backtracking.
- **Deserialisation** — any format that can reconstruct arbitrary objects from untrusted bytes.

## Cross-site scripting

- Output written into HTML without context-appropriate encoding. The context matters: HTML body,
  attribute, URL, inline script and CSS each need different escaping.
- Framework escape hatches: `dangerouslySetInnerHTML`, `v-html`, `|safe`, `innerHTML`, `document.write`.
- `href` or `src` built from input — `javascript:` and `data:` URLs.
- A Content-Security-Policy that allows `unsafe-inline` or `unsafe-eval` gives up most of its value.

## Cross-site request forgery

- State-changing endpoints reachable with only a cookie for authentication and no token or
  `SameSite` protection.
- `SameSite=None` without a compelling reason.
- Endpoints that change state on `GET`.

## Server-side request forgery

- Any outbound request to a URL that came from a user: webhooks, avatar imports, link previews,
  PDF renderers, XML parsers resolving external entities.
- Check for an allowlist of hosts and schemes, resolution of redirects, and blocking of internal
  address ranges including the cloud metadata endpoint.

## Open redirects

- A redirect target taken from a query parameter, form field or referrer without validation
  against known destinations.

## Transport and headers

- Plaintext fallback, certificate verification disabled, an outdated protocol version pinned.
- Missing: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, frame protection,
  `Referrer-Policy`, HSTS on a public site.
- CORS reflecting the `Origin` header, or `*` combined with credentials.

## Error handling and responses

- Stack traces, SQL fragments, internal paths, framework versions or hostnames in a response.
- Different responses for "unknown user" and "wrong password" — a user enumeration oracle.
- Verbose errors enabled in a production configuration.

## Rate limiting and resource use

- No limit on login, password reset, token exchange, mail sending, search, export, or anything
  that costs money.
- No maximum request or upload size, no pagination limit, no timeout on outbound calls.
- Unbounded retries, or retries without backoff.

## File handling

- A path built from user input — `../` traversal, absolute paths, symlinks, null bytes.
- Upload type judged by extension or by the client-supplied content type rather than content.
- Uploads stored inside the web root, or served with a content type the user controls.
- Archive extraction without limits on entry count, size or path (zip slip, zip bomb).
