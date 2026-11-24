# Operations runbook

## Configuration

All configuration comes from environment variables, validated at startup by `apps/api/src/config/env.ts`.
An invalid value stops the process with a list of every problem. Locally, `./run.sh` reads `.env`, which it creates from
`.env.example` with a random `SESSION_SECRET`.

| Variable                      | Default                               | Meaning                                                                                                                          |
| ----------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                         | `development`, `test` or `production`. Production enforces `COOKIE_SECURE=true` and an explicit `TRUST_PROXY`.                   |
| `API_HOST`                    | `127.0.0.1`                           | Bind address. Keep loopback behind nginx.                                                                                        |
| `API_PORT`                    | `4107`                                | API port.                                                                                                                        |
| `WEB_PORT`                    | `5107`                                | Vite dev server port (development only).                                                                                         |
| `APP_ORIGIN`                  | `http://localhost:5107`               | The only `Origin` accepted on mutating requests. Set it to the public https origin in production.                                |
| `DATABASE_URL`                | (required)                            | For example `postgres:///gridcalc_dev?host=/tmp` (local socket, OS user, no password).                                           |
| `TEST_DATABASE_URL`           | `postgres:///gridcalc_test?host=/tmp` | Database used by the API test suite. **Its schema is dropped on every run.**                                                     |
| `DB_POOL_MAX`                 | `10`                                  | Maximum pooled connections.                                                                                                      |
| `SESSION_SECRET`              | (required, 32+ chars)                 | HMAC key for session ids. Rotating it signs everyone out.                                                                        |
| `SESSION_TTL_HOURS`           | `12`                                  | Absolute session lifetime.                                                                                                       |
| `COOKIE_SECURE`               | `false`                               | Must be `true` in production (https only).                                                                                       |
| `TRUST_PROXY`                 | `false`                               | `false`, a hop count (`1` behind a single nginx) or comma-separated proxy IPs/CIDRs. `true` is rejected. Required in production. |
| `LOG_LEVEL`                   | `info`                                | pino level (`silent` in tests).                                                                                                  |
| `LOGIN_RATE_LIMIT_MAX`        | `5`                                   | Failed logins per email before progressive backoff (30 s, doubling, 1 h cap).                                                    |
| `LOGIN_RATE_LIMIT_WINDOW_SEC` | `900`                                 | Window for IP counters and failure decay.                                                                                        |
| `LOGIN_IP_RATE_LIMIT_MAX`     | `50`                                  | Login attempts per normalized client IP per window.                                                                              |
| `LOGIN_MAX_EMAILS_PER_IP`     | `20`                                  | Distinct emails one client IP (IPv6 /64) may try per window.                                                                     |
| `REGISTER_RATE_LIMIT_MAX`     | `5`                                   | Registrations per client IP per window.                                                                                          |
| `ENGINE_CACHE_SIZE`           | `16`                                  | Warm workbook engines kept in memory (LRU). `0` disables the cache.                                                              |
| `MAX_CELLS_PER_WORKBOOK`      | `200000`                              | Hard cap on non-empty cells; edits beyond it get 413.                                                                            |
| `BODY_LIMIT_BYTES`            | `4194304`                             | Maximum request body.                                                                                                            |

## Everyday commands

```bash
./run.sh setup            # prerequisites, .env, npm ci, create DB, migrate, seed
./run.sh                  # setup + start API (:4107) and web (:5107)
./run.sh migrate          # apply pending migrations only
./run.sh seed             # idempotent demo data
./run.sh reset --yes      # DROP and recreate the dev schema, migrate, seed (refuses in production)
./run.sh test             # lint, format, typecheck, all tests
npm run build             # apps/api/dist (bundled) and apps/web/dist
node --env-file=.env apps/api/dist/index.js          # run the built API
node --env-file=.env apps/api/dist/db/cli.js migrate  # migrate with the built CLI
```

Demo users exist only in seeded development databases: `owner@`, `editor@` and `viewer@gridcalc.test`, password `gridcalc-demo-pass`.

## Migrations

- Files live in `apps/api/migrations/NNNN_description.sql` and are applied in order, each in its own transaction,
  under a session advisory lock, so two deploys cannot migrate at the same time.
- Applied files are checksummed in `schema_migrations`. **Never edit an applied migration.** Add a new one.
- Migrations are forward-only. A rollback means restoring a backup or shipping a corrective migration (see deployment.md).

## Health checks

| Endpoint                   | Use                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Process liveness (no database access). For systemd watchdog or load-balancer liveness.                            |
| `GET /api/v1/health/ready` | Database reachable and `schema_migrations` readable. Returns `503` otherwise. Use for readiness and deploy gates. |

## Logs

Structured JSON on stdout (journald in production). Useful fields: `reqId` (also returned as `x-request-id`),
`req.method`, `req.url`, `res.statusCode`, `responseTime`, `err`, `migration`. Cookies, `authorization`, CSRF
headers and `set-cookie` are redacted. Look for `login throttle store full of active entries`: it means a
large-scale login attack is under way.

```bash
journalctl -u gridcalc-api -o cat | jq 'select(.res.statusCode >= 500)'
journalctl -u gridcalc-api -o cat | jq 'select(.reqId == "<id from a user report>")'
```

## Backup and restore (native PostgreSQL)

```bash
# Nightly logical backup (custom format, compressed); keep 14 days off-host
pg_dump --format=custom --no-owner --file=/var/backups/gridcalc/gridcalc-$(date +%F).dump "$DATABASE_URL"

# Verify a backup is readable
pg_restore --list /var/backups/gridcalc/gridcalc-2026-11-24.dump | head

# Restore into a fresh database (stop the API first, or restore side by side and switch DATABASE_URL)
createdb gridcalc_restore
pg_restore --no-owner --dbname=gridcalc_restore /var/backups/gridcalc/gridcalc-2026-11-24.dump
psql gridcalc_restore -c 'SELECT name FROM schema_migrations ORDER BY name'
```

Computed values are stored next to raw inputs, so a restored database serves reads right away. The first write
to each workbook rebuilds its engine from the `cells` table. For point-in-time recovery, enable WAL archiving
(`archive_mode=on`). Restore drills are scheduled with GC-103.

## Troubleshooting

| Symptom                                                                  | Likely cause                                                                 | Action                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot reach PostgreSQL via postgres:///postgres?host=/tmp` from run.sh | Server not running, or the socket is in another directory                    | `brew services start postgresql@17` / `sudo systemctl start postgresql`. On Debian the socket is `/var/run/postgresql`, so use `?host=/var/run/postgresql` in `DATABASE_URL`. |
| `role "<user>" does not exist`                                           | No role for your OS user                                                     | `sudo -u postgres createuser --createdb "$USER"`                                                                                                                              |
| Startup fails: `Invalid environment configuration`                       | Missing or invalid variable                                                  | The message lists each variable. In production, set `COOKIE_SECURE=true` and `TRUST_PROXY`.                                                                                   |
| `Migration 0001_foundation.sql was modified after being applied`         | An applied migration file changed                                            | Restore the file from git and put the change in a new migration.                                                                                                              |
| Users report "workbook changed elsewhere" often                          | `409 REVISION_CONFLICT` from several editors of one workbook                 | Expected until real-time collaboration (GC-089). Confirm with logs and consider splitting the work across workbooks.                                                          |
| Many `429 RATE_LIMITED` on login from one office                         | Shared NAT IP exceeds `LOGIN_IP_RATE_LIMIT_MAX` or `LOGIN_MAX_EMAILS_PER_IP` | Raise the limits carefully. Check `TRUST_PROXY`, because a wrong value makes every client look like the proxy IP.                                                             |
| Every client shares one throttle bucket                                  | `TRUST_PROXY=false` behind nginx                                             | Set `TRUST_PROXY=1` (single nginx on the same host).                                                                                                                          |
| API memory grows with large workbooks                                    | Warm engines in `EngineCache` (each about 1 KB per non-empty cell)           | Lower `ENGINE_CACHE_SIZE`. Engines rebuild on demand.                                                                                                                         |
| PATCH returns 413                                                        | Workbook at `MAX_CELLS_PER_WORKBOOK` or body above `BODY_LIMIT_BYTES`        | Split the batch or raise the limit after capacity testing (GC-102).                                                                                                           |
| Readiness 503 after a deploy                                             | Migrations not applied                                                       | Run `node apps/api/dist/db/cli.js migrate` with the production environment.                                                                                                   |
