-- 0002 first vertical slice: workbooks, sheets, cells and the revision log.

CREATE TABLE workbooks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  -- Monotonic revision, incremented by every committed change (optimistic concurrency).
  revision         bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX workbooks_org_updated_idx ON workbooks (organization_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE sheets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id  uuid NOT NULL REFERENCES workbooks (id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  position     integer NOT NULL CHECK (position >= 0),
  row_count    integer NOT NULL DEFAULT 100000 CHECK (row_count BETWEEN 1 AND 1048576),
  col_count    integer NOT NULL DEFAULT 52 CHECK (col_count BETWEEN 1 AND 16384),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sheets_workbook_name_key ON sheets (workbook_id, lower(name));
CREATE UNIQUE INDEX sheets_workbook_position_key ON sheets (workbook_id, position);

-- Sparse cell store: only non-empty cells have rows. `raw` is what the user typed,
-- `value_type`/`value` hold the last computed result so reads never need the engine.
CREATE TABLE cells (
  sheet_id          uuid NOT NULL REFERENCES sheets (id) ON DELETE CASCADE,
  row_idx           integer NOT NULL CHECK (row_idx BETWEEN 0 AND 1048575),
  col_idx           integer NOT NULL CHECK (col_idx BETWEEN 0 AND 16383),
  workbook_id       uuid NOT NULL REFERENCES workbooks (id) ON DELETE CASCADE,
  raw               text NOT NULL CHECK (raw <> '' AND length(raw) <= 8192),
  value_type        text NOT NULL CHECK (value_type IN ('empty', 'number', 'string', 'boolean', 'error')),
  value             jsonb NOT NULL,
  updated_revision  bigint NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, row_idx, col_idx)
);
CREATE INDEX cells_workbook_idx ON cells (workbook_id);

-- Append-only log of committed edit batches; the foundation for version history (M7).
CREATE TABLE workbook_revisions (
  workbook_id    uuid NOT NULL REFERENCES workbooks (id) ON DELETE CASCADE,
  revision       bigint NOT NULL,
  actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('cells', 'sheet.created', 'workbook.created')),
  edit_count     integer NOT NULL DEFAULT 0,
  recalculated   integer NOT NULL DEFAULT 0,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workbook_id, revision)
);
