# Authentication and sessions

## Token storage — the frequent one

**Never store access or refresh tokens in `localStorage` or `sessionStorage`.** Any script that
runs on the page can read them, they survive tab closure, and they have no built-in expiry. One
successful XSS becomes full account takeover with a stolen credential the user cannot revoke.

Acceptable instead:

- `HttpOnly; Secure; SameSite=Lax` (or `Strict`) cookies — the browser sends them, script cannot
  read them.
- An access token held in memory only, for the lifetime of the tab, refreshed from an `HttpOnly`
  cookie.

Also flag: a token in a URL or query string (it lands in logs, history and referrer headers), in
`window.name`, in a non-`HttpOnly` cookie, or in browser storage under any other key name.

## Session handling

- The session identifier must be regenerated on login and on any privilege change. Otherwise
  session fixation works.
- Logout must invalidate server-side. Clearing the client only ends the session on that device.
- Idle and absolute timeouts, both. A session that never expires is a permanent credential.
- Concurrent sessions: is there a way to see and revoke them?
- Session state bound to nothing — no rotation, no revocation list — cannot be shut off after a
  compromise.

## Tokens

- Signature verified with the expected algorithm. Reject `none`; do not let the token pick the
  algorithm.
- Expiry, issuer and audience all checked, not just the signature.
- Short-lived access tokens; refresh tokens rotated and revocable on reuse.
- No sensitive data in a token payload — it is signed, not encrypted, and readable by anyone.

## Passwords

- Argon2id, scrypt or bcrypt with current parameters. Never a plain hash, never a shared salt,
  never a home-made scheme.
- No maximum length below 64 characters, no character-class rules that push people to `Passwort1!`.
- Check against a list of known-breached passwords if the project can.
- Rehash on login when parameters have been raised.

## Recovery and change flows

Password reset is where accounts are actually taken over.

- Reset token: cryptographically random, single use, short-lived, invalidated after use and after
  a successful login.
- The reset response must not reveal whether the address exists.
- Changing a password or an email address requires the current password, and invalidates other
  sessions.
- Email change confirmed at the old address as well as the new one.

## Brute force and enumeration

- Rate limiting and lockout on login, reset, token exchange and MFA verification — by account and
  by source.
- Identical response and timing for "unknown user" and "wrong password", on registration, login
  and reset.
- MFA codes: rate-limited, single use, short-lived. Backup codes hashed like passwords.
