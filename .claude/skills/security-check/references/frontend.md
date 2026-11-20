# Frontend and browser

## Storage

**Tokens do not belong in `localStorage` or `sessionStorage`.** See `auth-session.md` — this is
the single most common finding in browser code and worth checking first.

Also flag in browser storage: personal data, another user's data left behind after a switch,
anything that is not cleared on logout, and anything treated as trustworthy when read back. All
of it is user-editable.

## DOM

- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` with anything derived from
  input, from the URL, or from an API response.
- Framework escape hatches: `dangerouslySetInnerHTML`, `v-html`, `[innerHTML]`, `{@html}`.
- `href`, `src`, `action`, `formaction` built from input — `javascript:` and `data:` URLs execute.
- `eval`, `new Function`, `setTimeout` with a string argument.
- Sanitising by hand with a regular expression. Use a maintained sanitiser or do not allow HTML.

## Content Security Policy

- Present at all? A CSP is the mitigation that turns an XSS into a non-event.
- `unsafe-inline` or `unsafe-eval` give away most of the benefit.
- A wildcard source, or a CDN that hosts arbitrary user content, is effectively an open policy.

## Third-party code

- Every script on the page has full access to the DOM, to storage, and to anything the user types.
  Is each one needed, and does it come from a controlled source?
- Subresource integrity on external scripts, and a pinned version rather than a moving tag.
- A tag manager is an open door for whoever can edit the tag configuration — worth naming.

## Client-side trust

- Validation only in the browser. Every client check must have a server counterpart; the client
  one is for convenience.
- Prices, quantities, discounts, roles, identifiers or permissions read from the client and
  trusted.
- A feature flag or an admin capability hidden with CSS rather than absent from the response.
- API responses that contain fields the screen does not show — the data is there, the hiding is
  cosmetic.

## Windows, messages and frames

- `window.postMessage` handlers that do not check `event.origin`.
- `window.open` or `target="_blank"` without `rel="noopener noreferrer"`.
- Framing allowed where clickjacking would matter — a confirmation dialog, a payment step.

## Data left behind

- Personal data or identifiers in the URL: they land in history, logs and the referrer header.
- Secrets in a bundled build. Anything shipped to the browser is public, including a
  "server-only" value that got inlined at build time.
- Source maps published for production code, exposing structure and sometimes comments.
