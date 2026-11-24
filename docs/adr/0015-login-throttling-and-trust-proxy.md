# ADR-0015: Login throttling design and explicit TRUST_PROXY

- Status: Accepted
- Date: 2026-11
- Deciders: gridcalc maintainers

## Context

Login is exposed to password spraying (many emails from one address), distributed guessing (one
email from many addresses) and parallel bursts that race the slow password hash. Behind a reverse
proxy the client address comes from `X-Forwarded-For`, which any client can forge if the proxy is
trusted blindly.

## Decision Drivers

- Stop spraying and per-account guessing
- Parallel requests must not bypass counters
- Bounded memory under attack
- Never lock out everyone
- Client address must not be spoofable

## Considered Options

### Option 1: Three in-process controls: per-IP fixed window, distinct-emails-per-IP cap, per-email progressive backoff with synchronous reservation; explicit TRUST_PROXY

Pros:

- Covers spraying and targeted guessing separately
- Reservation before the hash makes bursts count immediately
- Bounded store with resumable sweep and least-time-left eviction

Cons:

- State lives in one process; multi-instance needs GC-008
- Restart clears counters

### Option 2: Per-IP rate limit only

Pros:

- Simple

Cons:

- Distributed guessing against one account is unlimited

### Option 3: Hard account lockout after N failures

Pros:

- Strong against guessing

Cons:

- Lets anyone lock out any user by email; denial of service

### Option 4: Reverse-proxy rate limiting only

Pros:

- No application code

Cons:

- Proxy does not know which email was tried or whether the password was right

## Decision

`LoginThrottle.check(ip, email)` runs before the password hash: (1) per normalized IP fixed window
of `LOGIN_IP_RATE_LIMIT_MAX` (50) attempts per `LOGIN_RATE_LIMIT_WINDOW_SEC` (900 s);
(2) at most `LOGIN_MAX_EMAILS_PER_IP` (20) distinct emails per IP per window; (3) per email, the
attempt is reserved as a failure immediately; after `LOGIN_RATE_LIMIT_MAX` (5) failures the email is
locked for 30 s, doubling per further failure up to 1 h. `recordSuccess` clears the email. The
email store holds at most 10,000 entries; when full, a resumable cursor sweeps expired entries,
and if all are active the entry with the least lock time left is evicted with a warning log.
IPv4-mapped IPv6 addresses are normalized to IPv4 and IPv6 is collapsed to its /64. Registration
is limited per IP (`REGISTER_RATE_LIMIT_MAX`, 5 per window). `TRUST_PROXY` accepts `false`, a hop
count or a list of proxy IPs/CIDRs, rejects `true`, and must be set explicitly when
`NODE_ENV=production`.

## Consequences

### Positive

- Integration tests show per-email backoff across IPs, parallel bursts counted before hashing, and spoofed `X-Forwarded-For` ignored
- Responses are `429 RATE_LIMITED` with generic messages

### Negative

- Exactly one API instance until counters move to PostgreSQL (GC-008)
- Users behind one large NAT share the per-IP budget

## Links

- [auth/login-throttle.ts](../../apps/api/src/modules/auth/login-throttle.ts)
- [auth/client-ip.ts](../../apps/api/src/modules/auth/client-ip.ts)
- [config/env.ts](../../apps/api/src/config/env.ts) (`trustProxySchema`)
- [unit.test.ts](../../apps/api/test/unit.test.ts) (LoginThrottle)
- [auth.int.test.ts](../../apps/api/test/auth.int.test.ts) (login throttling)
