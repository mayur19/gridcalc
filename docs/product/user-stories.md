# gridcalc User Stories

Stories are grouped by epic (E01 to E17, matching [the backlog](../planning/backlog.md)). Each story names its persona (see [PRD.md](PRD.md) section 3), the functional requirements it satisfies ([requirements.md](requirements.md)) and its ticket(s).

Status legend: **Done** = implemented and tested in the current code; **Pending** = not built (any API operation answers `501 NOT_IMPLEMENTED` with the ticket).

| Epic | Title                                      | Stories | Done |
| ---- | ------------------------------------------ | ------: | ---: |
| E01  | Platform foundation                        |       3 |    3 |
| E02  | Identity, tenancy and access               |       9 |    4 |
| E03  | Formula language                           |      10 |    4 |
| E04  | Recalculation engine                       |       7 |    3 |
| E05  | Workbook persistence and API               |       7 |    4 |
| E06  | Grid UI                                    |       7 |    2 |
| E07  | Structural editing and reference rewriting |       3 |    0 |
| E08  | Formatting and number formats              |       4 |    0 |
| E09  | Clipboard, fill and undo/redo              |       3 |    0 |
| E10  | Sort and filter                            |       3 |    0 |
| E11  | Pivot tables                               |       2 |    0 |
| E12  | Charts                                     |       2 |    0 |
| E13  | Import / export                            |       3 |    0 |
| E14  | Real-time collaboration                    |       3 |    0 |
| E15  | Version history                            |       3 |    0 |
| E16  | Sharing and protection                     |       3 |    0 |
| E17  | Operations, performance and quality        |       4 |    0 |

---

## E01 Platform foundation

### US-E01-01 Install with one command (Done)

As **Ivo, platform operator**, I want to set up and run gridcalc with one launcher on a host with native PostgreSQL, so that installation does not need extra tooling.
Tickets: GC-001, GC-006, GC-007. Requirements: NFR-023, NFR-026.

- **Given** a clean checkout, Node.js >= 22 and a local PostgreSQL >= 15, **when** I run `./run.sh setup`, **then** prerequisites are checked, `.env` is created, dependencies are installed, the `gridcalc_dev` database is created if missing, migrations are applied and demo data is seeded once.
- **Given** the stack is set up, **when** I run `./run.sh dev`, **then** the API listens on port 4107 and the web app on port 5107.
- **Given** a pull request, **when** CI runs, **then** lint, type checks and all test suites run against the runner's PostgreSQL.

### US-E01-02 Fail fast on bad configuration (Done)

As **Ivo**, I want the server to refuse to start with unsafe or missing configuration, so that misconfiguration is caught before users are affected.
Tickets: GC-002. Requirements: FR-050, NFR-019.

- **Given** `SESSION_SECRET` is shorter than 32 characters, **when** the API starts, **then** it exits with a readable list of problems.
- **Given** `NODE_ENV=production` and `TRUST_PROXY` unset, **when** the API starts, **then** it refuses to start and names `TRUST_PROXY`.
- **Given** a request carrying a session cookie, **when** it is logged, **then** the cookie value appears as `[redacted]`.

### US-E01-03 Safe schema upgrades and health checks (Done)

As **Ivo**, I want forward-only migrations and health probes, so that upgrades are predictable and my process supervisor knows when the API is ready.
Tickets: GC-003, GC-004, GC-005. Requirements: FR-042, FR-043, FR-044.

- **Given** all migrations are applied, **when** I run `./run.sh migrate` again, **then** nothing changes.
- **Given** an applied migration file was edited, **when** migrations run, **then** they fail with a checksum mismatch naming the file.
- **Given** PostgreSQL is stopped, **when** the readiness probe is called, **then** it returns 503 while liveness still returns 200.

## E02 Identity, tenancy and access

### US-E02-01 Register my organization (Done)

As **Dana, team lead**, I want to create an organization and my owner account in one step, so that my team has a private space.
Tickets: GC-010. Requirements: FR-035.

- **Given** I am on the register page, **when** I submit organization name, display name, email and a 12+ character password, **then** I am signed in as owner and land on the workbooks list.
- **Given** the email is already registered, **when** I submit, **then** I receive the generic `REGISTRATION_REJECTED` response that does not confirm the email exists.

### US-E02-02 Sign in securely (Done)

As **Priya, finance analyst**, I want to sign in and stay signed in for the working day, so that I can edit my models.
Tickets: GC-011. Requirements: FR-036, FR-037, NFR-010.

- **Given** valid credentials, **when** I sign in, **then** an HttpOnly `gc_session` cookie and a readable `gc_csrf` cookie are set.
- **Given** I am signed in, **when** a mutation is sent without the `x-csrf-token` header or from a foreign Origin, **then** it is rejected with 403.
- **Given** I sign out, **when** I reuse the old cookie, **then** requests return 401.

### US-E02-03 Resist password guessing (Done)

As **Dana**, I want repeated failed logins to slow down attackers, so that member accounts are protected.
Tickets: GC-012. Requirements: FR-038, NFR-011.

- **Given** `LOGIN_RATE_LIMIT_MAX` failed attempts for one email, **when** another attempt arrives, **then** it is refused for 30 s, doubling on each further failure up to 1 h.
- **Given** one client IP tries more than `LOGIN_MAX_EMAILS_PER_IP` distinct emails in a window, **when** it tries another, **then** it is refused.
- **Given** many parallel attempts for one email, **when** they race, **then** no more than the allowed number reach password verification.

### US-E02-04 Roles limit what members can do (Done)

As **Sam, viewer**, I want read access without the ability to change anything, so that I cannot break figures by accident.
Tickets: GC-013, GC-015. Requirements: FR-039, FR-040, FR-041.

- **Given** I am a viewer, **when** I open a workbook, **then** the grid is read-only and a PATCH returns 403.
- **Given** I belong to organization B, **when** I request a workbook of organization A, **then** I receive 404.
- **Given** a workbook is created, **when** I inspect `audit_events`, **then** a `workbook.created` row names the actor and request id.

### US-E02-05 Verified sign-up (Pending)

As **Dana**, I want new accounts confirmed by email, so that the registration response never reveals existing accounts.
Tickets: GC-009. Requirements: FR-116.

- **Given** I register, **when** the request succeeds, **then** a verification message is written to the local outbox table and the account cannot sign in until verified.
- **Given** an existing email, **when** someone registers with it, **then** the response is identical to a new email.

### US-E02-06 Invite and manage members (Pending)

As **Dana**, I want to invite colleagues and change their roles, so that the right people have the right access.
Tickets: GC-016, GC-017. Requirements: FR-118, FR-119.

- **Given** I am an admin, **when** I invite `marco@example.com` as editor, **then** an outbox row with a single-use, expiring link is written.
- **Given** I am the last owner, **when** I try to demote myself, **then** the change is refused.

### US-E02-07 Reset a forgotten password (Pending)

As **Marco, operations planner**, I want to reset my password, so that I can regain access without an admin.
Tickets: GC-018. Requirements: FR-120.

- **Given** I request a reset, **when** the email is unknown, **then** the response is the same as for a known email.
- **Given** I confirm a reset, **when** it succeeds, **then** all my other sessions are revoked.

### US-E02-08 Review sessions and the audit log (Pending)

As **Dana**, I want to see active sessions and search the audit log, so that I can answer security questions.
Tickets: GC-019, GC-090. Requirements: FR-121, FR-122.

- **Given** I have sessions on two devices, **when** I revoke one, **then** that device's next request returns 401.
- **Given** I hold `audit:read`, **when** I filter the audit log by actor and date, **then** matching events are listed and exportable as CSV.

### US-E02-09 Belong to several organizations (Pending)

As **Priya**, I want to switch between organizations, so that I can work for two departments with one login.
Tickets: GC-014, GC-008. Requirements: FR-117, FR-123.

- **Given** I am a member of two organizations, **when** I switch, **then** the workbooks list shows only the selected organization's workbooks.
- **Given** two API instances, **when** I fail logins against both, **then** the combined attempts count toward one limit.

## E03 Formula language

### US-E03-01 Type formulas with familiar syntax (Done)

As **Priya**, I want A1 references, operators and precedence to behave like the spreadsheets I know, so that my formulas give expected results.
Tickets: GC-020, GC-021. Requirements: FR-001 to FR-005.

- **Given** an empty cell, **when** I enter `=-2^2`, **then** the cell shows 4.
- **Given** a sheet named `My Sheet`, **when** I enter `='My Sheet'!A1*2`, **then** the reference resolves to that sheet.
- **Given** a formula nested 65 levels deep, **when** I commit it, **then** the cell shows `#ERROR!` with a nesting message.

### US-E03-02 Understand errors and coercion (Done)

As **Priya**, I want clear error values and predictable conversions, so that I can diagnose broken formulas.
Tickets: GC-022. Requirements: FR-006 to FR-011.

- **Given** A1 contains `"3"` as text, **when** B1 is `=A1+1`, **then** B1 shows 4.
- **Given** B1 is `=1/0`, **when** C1 is `=B1+1`, **then** C1 shows `#DIV/0!` and the formula bar shows the message.
- **Given** I type `'=SUM(1)`, **when** I commit, **then** the cell stores the text `=SUM(1)`.

### US-E03-03 Use the core function library (Done)

As **Priya**, I want 43 core functions including SUMIF, VLOOKUP and INDEX/MATCH, so that I can build budget roll-ups.
Tickets: GC-023. Requirements: FR-012 to FR-017.

- **Given** categories in A2:A10 and amounts in B2:B10, **when** I enter `=SUMIF(A2:A10,"Travel*",B2:B10)`, **then** the sum covers categories starting with Travel, case-insensitively.
- **Given** a sorted key column, **when** I use `=VLOOKUP(42,A1:B100,2,TRUE)`, **then** the row of the largest key <= 42 is returned.
- **Given** an exact VLOOKUP key is missing, **when** it evaluates, **then** the cell shows `#N/A`.

### US-E03-04 Check formulas before saving (Done)

As **Priya**, I want the server to parse a formula and list its references, so that the editor can show problems early.
Tickets: GC-042. Requirements: FR-033.

- **Given** `=SUM(A1:B2)+C3`, **when** it is sent to `POST /api/v1/formulas/parse`, **then** the response contains the normalized formula and references `A1:B2` and `C3`.
- **Given** `=SUM(1,`, **when** it is parsed, **then** the response is a syntax error with a position.

### US-E03-05 Work with dates (Pending)

As **Marco**, I want date functions such as EDATE and NETWORKDAYS, so that I can schedule work.
Tickets: GC-024. Requirements: FR-051.

- **Given** A1 is `=DATE(2024,1,31)`, **when** B1 is `=EDATE(A1,1)`, **then** B1 is 2024-02-29.
- **Given** TODAY() is used, **when** any edit commits on a new day, **then** the value reflects the new date.

### US-E03-06 Multi-condition lookups and aggregates (Pending)

As **Priya**, I want XLOOKUP and SUMIFS, so that I can replace nested INDEX/MATCH constructs.
Tickets: GC-025, GC-026, GC-027. Requirements: FR-052, FR-053, FR-054.

- **Given** region and month columns, **when** I use `=SUMIFS(C:C,A:A,"EU",B:B,"Mar")`, **then** only matching rows are summed.
- **Given** XLOOKUP finds no match and a not-found value is supplied, **when** it evaluates, **then** the not-found value is returned.

### US-E03-07 Name important ranges (Pending)

As **Priya**, I want to define `Revenue` as a named range, so that formulas are readable.
Tickets: GC-028, GC-029. Requirements: FR-055, FR-056.

- **Given** `Revenue` refers to `Data!B2:B100`, **when** I enter `=SUM(Revenue)`, **then** the sum matches `=SUM(Data!B2:B100)`.
- **Given** `Revenue` is redefined, **when** the change commits, **then** every formula using it recalculates.

### US-E03-08 Volatile and dynamic references (Pending)

As **Marco**, I want INDIRECT and OFFSET, so that I can build selector-driven reports.
Tickets: GC-033. Requirements: FR-057.

- **Given** A1 is 5 and B1 is `=INDIRECT("C"&A1)`, **when** C5 changes, **then** B1 recalculates.

### US-E03-09 Spill array results (Pending)

As **Priya**, I want formulas that return arrays to fill neighbouring cells, so that I avoid copying formulas.
Tickets: GC-034. Requirements: FR-058.

- **Given** A1 is `=SEQUENCE(3)`, **when** it evaluates, **then** A1:A3 show 1, 2, 3.
- **Given** A2 holds a value, **when** A1 tries to spill, **then** A1 shows `#SPILL!`.

### US-E03-10 Autocomplete and locale input (Pending)

As **Priya**, I want function suggestions and my locale's separators, so that typing formulas is faster.
Tickets: GC-035, GC-036. Requirements: FR-059, FR-060.

- **Given** I type `=VL`, **when** suggestions appear, **then** VLOOKUP is listed with its signature.
- **Given** a decimal-comma locale, **when** I type `=ROUND(1,5;0)`, **then** the stored formula is `=ROUND(1.5,0)`.

## E04 Recalculation engine

### US-E04-01 Only affected cells recalculate (Done)

As **Marco**, I want edits to recalculate just the cells that depend on them, so that large plans stay responsive.
Tickets: GC-030, GC-031. Requirements: FR-018 to FR-021, NFR-003.

- **Given** B1 `=A1*2` and C1 `=B1+1` and an unrelated D1 `=E1`, **when** I change A1, **then** B1 and C1 recalculate and D1 does not.
- **Given** a recalculated cell's value is unchanged, **when** the response is returned, **then** that cell is omitted from the changed list.
- **Given** a 100,000-long chain, **when** its head changes, **then** recalculation completes without stack overflow.

### US-E04-02 Circular references are visible (Done)

As **Priya**, I want circular references flagged, so that they never produce silent wrong numbers.
Tickets: GC-031. Requirements: FR-022.

- **Given** A1 `=B1` and B1 `=A1`, **when** both commit, **then** both show `#CYCLE!`.
- **Given** the cycle, **when** I replace B1 with 5, **then** A1 shows 5.

### US-E04-03 Incremental results are trustworthy (Done)

As **Priya**, I want proof that incremental recalculation equals full recalculation, so that I can trust totals.
Tickets: GC-032. Requirements: FR-023.

- **Given** a randomized workbook and edit sequence (25 seeds), **when** each edit is applied, **then** every cell equals the value from a freshly built engine.

### US-E04-04 Long recalculations do not freeze the server (Pending)

As **Ivo**, I want recalculation in a worker with a time budget, so that one heavy workbook cannot block others.
Tickets: GC-037, GC-038. Requirements: FR-061, FR-062.

- **Given** a recalculation exceeds its budget, **when** it is cancelled, **then** the batch is rolled back and health probes kept responding.
- **Given** a snapshot for the current revision, **when** the workbook is opened after restart, **then** formulas are not re-evaluated.

### US-E04-05 Fast wide-range dependents (Pending)

As **Marco**, I want many overlapping range formulas to stay fast, so that summary sheets do not slow edits.
Tickets: GC-047. Requirements: FR-063.

- **Given** 10,000 overlapping range formulas, **when** a cell changes, **then** dependents are found within the NFR-001 budget.

### US-E04-06 Intentional iteration (Pending)

As **Priya**, I want an opt-in iterative mode, so that I can model interest that depends on the closing balance.
Tickets: GC-048. Requirements: FR-064.

- **Given** iteration is enabled with 100 iterations and tolerance 0.001, **when** A1 is `=(A1+10)/2`, **then** A1 converges to 10.

### US-E04-07 Trace precedents and dependents (Pending)

As **Priya**, I want arrows showing where a value comes from, so that I can audit a model.
Tickets: GC-049. Requirements: FR-065.

- **Given** C1 `=A1+B1`, **when** I trace precedents of C1, **then** arrows point from A1 and B1.

## E05 Workbook persistence and API

### US-E05-01 Create and open workbooks (Done)

As **Priya**, I want to create a workbook and find it later, so that my models persist.
Tickets: GC-040, GC-041. Requirements: FR-025, FR-026, FR-032.

- **Given** I am an editor, **when** I create "Q3 Budget", **then** it appears in my workbook list with one sheet.
- **Given** a workbook, **when** I add sheet "Data", **then** the revision increments and a revision row is appended.

### US-E05-02 Save edits atomically (Done)

As **Marco**, I want a batch of edits to save completely or not at all, so that the plan is never half-updated.
Tickets: GC-041. Requirements: FR-027, FR-028, FR-031, NFR-018.

- **Given** a batch of 500 edits, **when** I submit it, **then** all edits and recalculated values commit under one new revision.
- **Given** a batch that would exceed 200,000 cells, **when** I submit it, **then** it returns 413 and nothing changes.

### US-E05-03 Never overwrite a colleague silently (Done)

As **Marco**, I want stale saves rejected, so that I never overwrite someone else's change.
Tickets: GC-041. Requirements: FR-029, FR-030.

- **Given** my client holds revision 7 and the server is at 8, **when** I PATCH with `baseRevision` 7, **then** I receive 409 `REVISION_CONFLICT` with `currentRevision` 8.
- **Given** five clients PATCH on the same revision at once, **when** they complete, **then** exactly one succeeds.

### US-E05-04 Explore with demo data (Done)

As **Ivo**, I want a seed command, so that I can demonstrate the product immediately.
Tickets: GC-052. Requirements: FR-034.

- **Given** an empty database, **when** I run `./run.sh seed` twice, **then** one demo organization and one calculated budget workbook exist.

### US-E05-05 Rename, delete and duplicate workbooks (Pending)

As **Priya**, I want to manage workbooks, so that my list stays tidy.
Tickets: GC-043, GC-045. Requirements: FR-066, FR-068.

- **Given** a workbook, **when** I duplicate it, **then** the copy has identical values and a new id.
- **Given** 200 workbooks, **when** I search "budget", **then** only matching workbooks are listed, paginated.

### US-E05-06 Manage sheets (Pending)

As **Priya**, I want to rename sheets without breaking formulas, so that names stay meaningful.
Tickets: GC-044. Requirements: FR-067.

- **Given** `=Data!A1` in Sheet1, **when** I rename Data to Inputs, **then** the formula reads `=Inputs!A1` and the value is unchanged.

### US-E05-07 Discuss cells (Pending)

As **Sam, viewer and stakeholder**, I want to comment on a figure, so that I can ask questions in context.
Tickets: GC-046. Requirements: FR-069.

- **Given** commenter access, **when** I add a comment to B7, **then** B7 shows an indicator and the thread lists my comment.

## E06 Grid UI

### US-E06-01 Navigate the app (Done)

As **Sam**, I want clear navigation that shows what exists and what is planned, so that I know what I can use.
Tickets: GC-050. Requirements: FR-045.

- **Given** I am signed out, **when** I open `/workbooks`, **then** I am redirected to login.
- **Given** I open the navigation, **when** I look at Pivot tables, **then** it shows a Planned badge with ticket GC-077.

### US-E06-02 Edit cells in a fast grid (Done)

As **Marco**, I want a grid that scrolls smoothly over 100,000 rows with keyboard editing, so that I can work quickly.
Tickets: GC-051. Requirements: FR-046 to FR-049, NFR-005.

- **Given** a 100,000-row sheet, **when** it renders, **then** only the visible window of cells is in the DOM.
- **Given** a selected cell, **when** I press F2, edit and press Enter, **then** the edit is saved and dependents update.
- **Given** a formula cell, **when** I select it, **then** the formula bar shows the formula and any error message.
- **Given** two sheets, **when** I click the second tab, **then** its cells load.

### US-E06-03 Resize and freeze (Pending)

As **Marco**, I want resizable columns and frozen headers, so that wide tables stay readable.
Tickets: GC-053, GC-055. Requirements: FR-070, FR-072.

- **Given** I drag a column border, **when** I reload, **then** the width is preserved.
- **Given** row 1 is frozen, **when** I scroll down, **then** row 1 stays visible.

### US-E06-04 Select ranges and see statistics (Pending)

As **Priya**, I want to select ranges and see their sum, so that I can sanity-check figures.
Tickets: GC-054. Requirements: FR-071.

- **Given** B2:B10 contain numbers, **when** I select them, **then** the status bar shows SUM, AVERAGE and COUNT.

### US-E06-05 Find and replace (Pending)

As **Marco**, I want to find and replace across sheets, so that I can rename a supplier everywhere.
Tickets: GC-057. Requirements: FR-074.

- **Given** "Acme" appears on three sheets, **when** I replace it with "Acme Ltd", **then** all occurrences change in one revision.

### US-E06-06 Accessible grid (Pending)

As a **screen reader user (any persona)**, I want cell addresses and values announced, so that I can use the grid without sight.
Tickets: GC-058. Requirements: FR-075, NFR-021.

- **Given** the grid is focused, **when** I move to C4, **then** "C4" and its value are announced.

### US-E06-07 Large sheets and small screens (Pending)

As **Sam**, I want to view figures on a phone and on million-row sheets, so that I can check numbers anywhere.
Tickets: GC-056, GC-059. Requirements: FR-073, FR-076.

- **Given** a 375 px wide screen, **when** I open a workbook, **then** I can scroll, select and edit a cell.

## E07 Structural editing and reference rewriting

### US-E07-01 Insert and delete rows (Pending)

As **Priya**, I want inserted rows to extend my totals, so that I never fix ranges by hand.
Tickets: GC-060. Requirements: FR-077.

- **Given** A11 `=SUM(A1:A10)`, **when** I insert a row at 5, **then** the formula moves to A12 and reads `=SUM(A1:A11)`.
- **Given** B1 `=A3`, **when** I delete row 3, **then** B1 reads `=#REF!` and shows `#REF!`.

### US-E07-02 Insert and delete columns, move ranges (Pending)

As **Marco**, I want columns and moved blocks to keep formulas correct, so that restructuring is safe.
Tickets: GC-061, GC-062. Requirements: FR-078, FR-079.

- **Given** `=Data!C1` on Sheet1, **when** I insert a column before C on Data, **then** the formula reads `=Data!D1`.
- **Given** `=A1` in E1, **when** I move A1:B2 to D1, **then** E1 reads `=D1`.

### US-E07-03 Hide and group (Pending)

As **Priya**, I want to collapse detail rows, so that I can present summaries.
Tickets: GC-063. Requirements: FR-080.

- **Given** rows 2 to 10 are grouped, **when** I collapse the group, **then** they are hidden but still counted by SUM.

## E08 Formatting and number formats

### US-E08-01 Style cells (Pending)

As **Priya**, I want bold headers, fills and borders, so that my reports are readable.
Tickets: GC-064, GC-068. Requirements: FR-081, FR-085.

- **Given** A1:F1 selected, **when** I apply bold and a fill, **then** the style persists and is stored as one range run.

### US-E08-02 Format numbers (Pending)

As **Priya**, I want currency, percent and date formats, so that values display correctly.
Tickets: GC-065. Requirements: FR-082.

- **Given** 1234.5 with format `#,##0.00`, **when** displayed, **then** it reads `1,234.50`.

### US-E08-03 Highlight conditions (Pending)

As **Priya**, I want overspent lines highlighted, so that variances stand out.
Tickets: GC-066. Requirements: FR-083.

- **Given** a rule "value > budget fills red", **when** actuals exceed budget after recalculation, **then** the cell turns red.

### US-E08-04 Validate input (Pending)

As **Marco**, I want dropdown lists for status columns, so that data stays consistent.
Tickets: GC-067. Requirements: FR-084.

- **Given** a list rule "Open, Closed", **when** I type "Done", **then** the entry is rejected with the rule message.

## E09 Clipboard, fill and undo/redo

### US-E09-01 Undo mistakes (Pending)

As **Marco**, I want undo and redo, so that I can recover from errors.
Tickets: GC-070. Requirements: FR-086.

- **Given** I cleared a range, **when** I press Ctrl+Z, **then** the values return as a new revision.

### US-E09-02 Copy and paste formulas (Pending)

As **Priya**, I want pasted formulas to shift their relative references, so that I can replicate calculations.
Tickets: GC-071, GC-072. Requirements: FR-087, FR-088.

- **Given** C1 `=A1+$B$1`, **when** I paste it into C2, **then** C2 reads `=A2+$B$1`.
- **Given** tab-separated text copied from another tool, **when** I paste it, **then** it fills a block of cells.

### US-E09-03 Fill series (Pending)

As **Marco**, I want to drag the fill handle to extend dates and numbers, so that I can build timelines quickly.
Tickets: GC-073. Requirements: FR-089.

- **Given** A1 `Jan` and A2 `Feb`, **when** I drag down to A6, **then** A3:A6 read Mar to Jun.

## E10 Sort and filter

### US-E10-01 Sort ranges (Pending)

As **Marco**, I want multi-key sorting, so that I can order a plan by priority then date.
Tickets: GC-074. Requirements: FR-090.

- **Given** rows with equal priority, **when** I sort by priority, **then** their relative order is preserved.

### US-E10-02 Filter rows (Pending)

As **Marco**, I want to filter by value and condition, so that I can focus on overdue items.
Tickets: GC-075. Requirements: FR-091.

- **Given** a filter "Status = Open", **when** applied, **then** other rows are hidden and formulas still include them.

### US-E10-03 Personal filter views (Pending)

As **Sam**, I want my own filter view, so that I do not disturb colleagues.
Tickets: GC-076. Requirements: FR-092.

- **Given** I apply a filter view, **when** Marco opens the sheet, **then** he sees all rows.

## E11 Pivot tables

### US-E11-01 Summarize with a pivot (Pending)

As **Priya**, I want to drag fields into a pivot, so that I can summarize spend by department and month.
Tickets: GC-077, GC-078. Requirements: FR-093, FR-094.

- **Given** a source range with Department, Month and Amount, **when** I place Department in rows and Amount in values, **then** totals equal the equivalent SUMIF results.
- **Given** the source changes, **when** I refresh, **then** the output sheet updates in one revision.

### US-E11-02 Group dates and add calculated fields (Pending)

As **Priya**, I want monthly grouping and calculated fields, so that I can show variance.
Tickets: GC-079. Requirements: FR-095.

- **Given** a year of dated rows, **when** I group by month, **then** 12 buckets appear.

## E12 Charts

### US-E12-01 Chart a range (Pending)

As **Sam**, I want charts that update with the data, so that I always see current trends.
Tickets: GC-080, GC-081. Requirements: FR-096, FR-097.

- **Given** a line chart bound to B2:B13, **when** B5 changes, **then** the chart re-renders.

### US-E12-02 Export a chart (Pending)

As **Sam**, I want to export a chart as PNG or SVG, so that I can put it in a report.
Tickets: GC-082. Requirements: FR-098.

- **Given** a chart, **when** I export PNG, **then** the file matches the on-screen dimensions.

## E13 Import / export

### US-E13-01 Import CSV (Pending)

As **Marco**, I want to import CSV exports from other systems, so that I avoid re-keying.
Tickets: GC-083, GC-087. Requirements: FR-099, FR-103.

- **Given** a semicolon-delimited CSV, **when** I import it, **then** the delimiter is detected and numeric columns import as numbers.
- **Given** a large file, **when** the import runs, **then** I can poll its job status until it succeeds.

### US-E13-02 Export CSV and XLSX-lite (Pending)

As **Sam**, I want to download a sheet, so that I can share it with people outside gridcalc.
Tickets: GC-084, GC-086. Requirements: FR-100, FR-102.

- **Given** a sheet with formulas, **when** I export CSV, **then** computed values are written with correct quoting.

### US-E13-03 Import XLSX-lite (Pending)

As **Priya**, I want to bring in existing spreadsheet files, so that I can migrate my models.
Tickets: GC-085. Requirements: FR-101.

- **Given** an XLSX file with two sheets and formulas, **when** I import it, **then** values, formulas and sheet names are preserved and unsupported features are reported.

## E14 Real-time collaboration

### US-E14-01 See colleagues' edits live (Pending)

As **Marco**, I want edits from others to appear without reloading, so that we can plan together.
Tickets: GC-088, GC-089, GC-093. Requirements: FR-104, FR-105, FR-108.

- **Given** Priya and I have the same workbook open, **when** she edits B2, **then** I see the new value and its dependents within 500 ms.
- **Given** we both edit B2, **when** both commit, **then** the later commit wins and the other user is notified.

### US-E14-02 See where others are working (Pending)

As **Priya**, I want to see colleagues' cursors, so that we avoid editing the same area.
Tickets: GC-091. Requirements: FR-106.

- **Given** Marco selects D4:D9, **when** I view the sheet, **then** his selection is outlined with his avatar.

### US-E14-03 Keep working offline (Pending)

As **Marco**, I want edits made during a network drop to sync later, so that I do not lose work.
Tickets: GC-092. Requirements: FR-107.

- **Given** I edit three cells while offline, **when** I reconnect, **then** the edits commit in order or show conflicts.

## E15 Version history

### US-E15-01 Browse the timeline (Pending)

As **Dana**, I want to see who changed the workbook and when, so that I can review activity.
Tickets: GC-094, GC-097. Requirements: FR-109, FR-112.

- **Given** a workbook with 50 revisions, **when** I open history, **then** revisions are listed with actor, time and edit count.

### US-E15-02 Name and restore versions (Pending)

As **Priya**, I want to name "Board submission" and restore it later, so that I can recover a known-good state.
Tickets: GC-095. Requirements: FR-110.

- **Given** a named version, **when** I restore it, **then** a new revision makes all cells equal to that version.

### US-E15-03 Cell history (Pending)

As **Dana**, I want to see who changed a cell, so that I can ask the right person.
Tickets: GC-096. Requirements: FR-111.

- **Given** B7 was edited three times, **when** I open its history, **then** all three raw inputs, actors and revisions are listed.

## E16 Sharing and protection

### US-E16-01 Share a workbook with specific people (Pending)

As **Dana**, I want to grant workbook-level roles, so that access can differ from organization roles.
Tickets: GC-098. Requirements: FR-113.

- **Given** Marco is an org editor with workbook viewer access, **when** he edits, **then** he receives 403.

### US-E16-02 View-only links (Pending)

As **Dana**, I want revocable view-only links, so that stakeholders can see figures without accounts.
Tickets: GC-099. Requirements: FR-114.

- **Given** a share link, **when** I revoke it, **then** the next request with it returns 404.

### US-E16-03 Protect key ranges (Pending)

As **Priya**, I want to lock assumption cells, so that others cannot change them.
Tickets: GC-100. Requirements: FR-115.

- **Given** B2:B5 is protected, **when** an editor without permission submits a batch touching B3, **then** the whole batch is rejected.

## E17 Operations, performance and quality

### US-E17-01 Monitor the service (Pending)

As **Ivo**, I want metrics including recalculation latency, so that I can alert on regressions.
Tickets: GC-101. Requirements: FR-124, NFR-020.

- **Given** the metrics endpoint, **when** it is scraped, **then** it returns Prometheus text with recalculation latency histograms.

### US-E17-02 Enforce performance budgets (Pending)

As **Ivo**, I want CI to fail on performance regressions, so that large workbooks stay fast.
Tickets: GC-102. Requirements: NFR-001, NFR-002, NFR-004.

- **Given** the 100k-row, 10k-formula harness, **when** CI runs, **then** it fails if p95 recalculation exceeds the budget by more than 20%.

### US-E17-03 Back up, restore and export data (Pending)

As **Ivo**, I want scripted backups and organization export or deletion, so that I can recover and meet privacy requests.
Tickets: GC-103, GC-104. Requirements: FR-125, FR-126, NFR-017, NFR-029.

- **Given** last night's backup, **when** I run the restore drill on a fresh host, **then** readiness passes and the latest committed revision is present.

### US-E17-04 Test and secure the supply chain (Pending)

As **Ivo**, I want E2E tests, CSP and dependency audits in CI, so that releases are safe.
Tickets: GC-105, GC-106. Requirements: NFR-014, NFR-025.

- **Given** a pull request, **when** CI runs, **then** Playwright E2E specs, the dependency audit and secret scanning all pass.
