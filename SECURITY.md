# Security policy

## Supported versions

Only the latest `main` is supported while the project is pre-1.0.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting ("Report a vulnerability" under
the Security tab of this repository). Include steps to reproduce, the affected endpoint or module, and the impact.
We aim to acknowledge reports within 3 business days and to ship a fix or mitigation for high-severity issues within 14 days.

## Scope and design

The security design, trust boundaries, STRIDE analysis and ASVS mapping are in
[docs/security/threat-model.md](docs/security/threat-model.md). Known residual risks are listed there, including
the single-instance requirement for login throttling (until GC-008) and the registration status-code signal (until GC-009).

## Hardening checklist for deployments

- `NODE_ENV=production`, `COOKIE_SECURE=true`, a random 32-byte `SESSION_SECRET`, and an explicit `TRUST_PROXY` (hop count or proxy list, never `true`).
- Serve only over TLS. Bind the API to loopback behind nginx.
- Run a single API instance until GC-008 lands.
- Keep regular `pg_dump` backups and test restores.
