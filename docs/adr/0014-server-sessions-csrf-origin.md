# ADR-0014: Server sessions in Postgres with CSRF double-submit and Origin checks instead of JWT

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

The browser SPA and API are served to the same users; there are no third-party API clients yet.
Sessions must be revocable immediately (logout, future password reset GC-018 and device revoke
GC-019). Cookies bring CSRF exposure that must be closed.

## Decision Drivers

- Immediate revocation
- Tokens unusable if the database leaks
- No token readable by page scripts
- Protection against cross-site requests

## Considered Options

### Option 1: Opaque random token in an HttpOnly cookie; database stores HMAC-SHA256(SESSION_SECRET, token); per-session CSRF token sent in a header; Origin allow-list

Pros:

- Logout deletes the row; effect is immediate
- A leaked `sessions` table does not contain usable cookies
- Session cookie is invisible to scripts

Cons:

- One indexed lookup per request
- Needs CSRF defence because cookies are ambient

### Option 2: Signed JWT in a cookie or local storage

Pros:

- Stateless verification

Cons:

- Revocation needs a deny list, which is a session table again
- Local storage exposes the token to any injected script
- Claims go stale (role changes) until expiry

### Option 3: JWT access token plus refresh token rotation

Pros:

- Short-lived access tokens

Cons:

- Two token kinds, rotation races, and still a server-side store for refresh tokens

## Decision

On login or registration the API creates a 32-byte random token, stores
`id = HMAC-SHA256(SESSION_SECRET, token)` with a random `csrf_token`, and sets `gc_session`
(HttpOnly, SameSite=Lax, Secure when `COOKIE_SECURE`) and `gc_csrf` (readable). Every mutating
request must carry `Origin` equal to `APP_ORIGIN` when present, and, if a session exists, an
`x-csrf-token` header equal to the session's token (timing-safe compare). Login and register are
exempt from the CSRF check because no session exists yet, but they are still Origin-checked.
Expiry is absolute (`SESSION_TTL_HOURS`, default 12); `last_seen_at` is updated at most once a
minute. Passwords use scrypt (N=16384, r=8, p=1).

## Consequences

### Positive

- Logout and future revoke flows are a single DELETE
- Role changes take effect on the next request because the role is read with the session

### Negative

- A database round trip per request to resolve the session
- Expired rows accumulate until a cleanup is added (index `sessions_expires_idx` is ready)
- Non-browser API clients will need a separate token scheme later

## Links

- [auth/auth.plugin.ts](../../apps/api/src/modules/auth/auth.plugin.ts)
- [auth/tokens.ts](../../apps/api/src/modules/auth/tokens.ts)
- [auth/password.ts](../../apps/api/src/modules/auth/password.ts)
- [auth.int.test.ts](../../apps/api/test/auth.int.test.ts)
- [0001_foundation.sql](../../apps/api/migrations/0001_foundation.sql)
