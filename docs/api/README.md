# gridcalc API

The machine-readable contract is [openapi.yaml](openapi.yaml) (OpenAPI 3.1). It describes the **full target API**:
14 operations are live (`x-status: implemented`) and 74 are registered placeholders (`x-status: pending`, with
`x-ticket`) that answer `501 NOT_IMPLEMENTED`. The pending routes come straight from
`apps/api/src/modules/pending/pending.routes.ts`, and an integration test (`apps/api/test/platform.int.test.ts`)
calls every one of them, so the live surface and the spec cannot drift apart.

Base URL in development: `http://127.0.0.1:4107` (the Vite dev server on `:5107` proxies `/api`).

## Conventions

| Topic       | Rule                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versioning  | Path prefix `/api/v1`. Breaking changes need a new prefix. Additive fields are allowed at any time.                                                                                                                                  |
| Media type  | `application/json` (UTF-8) for requests and responses. Other content types get `400 VALIDATION_FAILED`.                                                                                                                              |
| Envelope    | Every response is `{ "data": ..., "error": null, "meta"?: {...} }` on success and `{ "data": null, "error": { "code", "message", "details"? } }` on failure.                                                                         |
| Identifiers | UUID v4 strings. Rows and columns are **zero-based integers** (`A1` is `row: 0, col: 0`).                                                                                                                                            |
| Time        | ISO-8601 UTC strings (`timestamptz` in Postgres).                                                                                                                                                                                    |
| Request ids | Send `x-request-id` (8-64 chars of `[A-Za-z0-9._-]`) to correlate logs, or one is created. It is echoed back on every response.                                                                                                      |
| Validation  | zod schemas at every boundary (`packages/shared/src/api/schemas.ts`). Unknown fields are ignored.                                                                                                                                    |
| Limits      | Body 4 MiB (`BODY_LIMIT_BYTES`), 1,000 edits per PATCH, 8,192 characters per cell, 250,000 cells per read window, 200,000 non-empty cells per workbook (`MAX_CELLS_PER_WORKBOOK`), formula nesting depth 64, 255 arguments per call. |

## Error codes

| HTTP | `error.code`            | When                                                                                                                        |
| ---: | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
|  400 | `VALIDATION_FAILED`     | Body, params or query fail validation. `details` is `[{ path, message }]`. Also malformed JSON and unsupported media types. |
|  400 | `REGISTRATION_REJECTED` | Registration could not be completed. The message is deliberately generic and does not say whether the email exists.         |
|  401 | `UNAUTHENTICATED`       | No valid session, or wrong email/password on login (generic message).                                                       |
|  403 | `CSRF_TOKEN_INVALID`    | Mutating request with a session but missing/wrong `x-csrf-token`.                                                           |
|  403 | `FORBIDDEN`             | Role lacks the permission, or a mutating request came from a foreign `Origin`.                                              |
|  404 | `NOT_FOUND`             | Unknown route or resource. Resources of other organizations also return 404, so ids cannot be probed.                       |
|  409 | `CONFLICT`              | Uniqueness violation (for example a duplicate sheet name).                                                                  |
|  409 | `REVISION_CONFLICT`     | `baseRevision` is stale. `details.currentRevision` holds the current revision.                                              |
|  413 | `PAYLOAD_TOO_LARGE`     | Body exceeds the limit, or the edit would push the workbook over the cell limit.                                            |
|  429 | `RATE_LIMITED`          | Login or registration throttled. The `Retry-After` header holds seconds.                                                    |
|  500 | `INTERNAL`              | Unexpected failure. Details are logged server-side with the request id, never returned.                                     |
|  501 | `NOT_IMPLEMENTED`       | Pending endpoint. `details.ticket` names the backlog ticket.                                                                |

## Authentication and CSRF

1. `POST /api/v1/auth/register` or `POST /api/v1/auth/login` sets two cookies:
   - `gc_session`: an opaque 256-bit token. It is HttpOnly, SameSite=Lax, and Secure when `COOKIE_SECURE=true`. The database stores only `HMAC-SHA256(SESSION_SECRET, token)`.
   - `gc_csrf`: the session's CSRF token. It is readable by the page and also returned as `data.csrfToken`.
2. Every `POST`, `PUT`, `PATCH` and `DELETE` made with a session must send `x-csrf-token: <gc_csrf value>`.
3. If an `Origin` header is present on a mutating request, it must equal `APP_ORIGIN`. This also protects login and registration, which are exempt from the CSRF header because no session exists yet.
4. Sessions expire after `SESSION_TTL_HOURS`. `POST /api/v1/auth/logout` deletes the session row.

Login is throttled per client IP, per number of distinct emails tried from one IP, and per email with progressive
backoff. See [ADR-0015](../adr/0015-login-throttling-and-trust-proxy.md) and the [threat model](../security/threat-model.md).

## Pagination

List endpoints accept `limit` (1-100, default 25) and `offset` (default 0) and return `meta: { total, limit, offset }`.
Ordering is stable: `updated_at DESC, id`. Cursor pagination is planned for the audit log (GC-090).

## Optimistic concurrency for cell edits

Every committed change increments the workbook `revision`. A client:

1. reads `meta.revision` from `GET .../sheets/{sheetId}/cells` (or `revision` from `GET /workbooks/{id}`);
2. sends `PATCH /workbooks/{id}/cells` with that value as `baseRevision`;
3. on `200`, stores `data.revision` and merges `data.changed` (edited cells plus every recalculated cell whose value changed);
4. on `409 REVISION_CONFLICT`, reloads the affected sheet and re-applies or re-prompts the edit.

The server serializes writers per workbook with a row lock (`SELECT ... FOR UPDATE`), so exactly one of several
concurrent writers with the same `baseRevision` succeeds. Real-time merge of concurrent edits is planned (GC-089).

## curl walkthrough (local development)

The demo credentials below exist only in the local seed (`./run.sh setup`).

```bash
B=http://127.0.0.1:4107/api/v1
O='origin: http://localhost:5107'
JAR=$(mktemp)

# Health
curl -s $B/health/ready

# Sign in (stores gc_session and gc_csrf)
curl -s -c "$JAR" -H "$O" -H 'content-type: application/json' \
  -d '{"email":"owner@gridcalc.test","password":"gridcalc-demo-pass"}' $B/auth/login
CSRF=$(awk '$6=="gc_csrf"{print $7}' "$JAR")

# List workbooks and open the first one
WB=$(curl -s -b "$JAR" $B/workbooks | node -pe 'JSON.parse(require("fs").readFileSync(0)).data[0].id')
curl -s -b "$JAR" $B/workbooks/$WB

# Read a window of cells (sheetId from the previous response)
curl -s -b "$JAR" "$B/workbooks/$WB/sheets/$SHEET/cells?range=A1:H12"

# Edit B2 and receive every dependent that changed
curl -s -b "$JAR" -X PATCH -H "$O" -H "x-csrf-token: $CSRF" -H 'content-type: application/json' \
  -d "{\"baseRevision\":$REV,\"edits\":[{\"sheetId\":\"$SHEET\",\"row\":1,\"col\":1,\"raw\":\"200000\"}]}" \
  $B/workbooks/$WB/cells

# Validate a formula for the formula bar
curl -s -b "$JAR" -X POST -H "$O" -H "x-csrf-token: $CSRF" -H 'content-type: application/json' \
  -d '{"formula":"=VLOOKUP(A2,Limits!A2:B7,2,FALSE)"}' $B/formulas/parse

# A pending endpoint answers 501 with its ticket
curl -s -b "$JAR" -X POST -H "$O" -H "x-csrf-token: $CSRF" $B/workbooks/$WB/undo
# {"data":null,"error":{"code":"NOT_IMPLEMENTED","message":"Undo is planned but not implemented yet","details":{"ticket":"GC-070"}}}
```
