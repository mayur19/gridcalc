import { RecalcEngine } from '@gridcalc/shared';
import type { Logger } from 'pino';
import { hashPassword } from '../modules/auth/password.js';
import * as repo from '../modules/workbooks/workbook.repository.js';
import { withTransaction, type Db } from './pool.js';

/**
 * Development demo data: one organization, three users (owner/editor/viewer) and a
 * "Quarterly budget" workbook exercising cross-sheet refs, ranges, lookups and a
 * deliberate error. Credentials are for local development only (see README).
 */
export const DEMO_PASSWORD = 'gridcalc-demo-pass';
export const DEMO_USERS = [
  { email: 'owner@gridcalc.test', displayName: 'Olivia Owner', role: 'owner' },
  { email: 'editor@gridcalc.test', displayName: 'Ethan Editor', role: 'editor' },
  { email: 'viewer@gridcalc.test', displayName: 'Vera Viewer', role: 'viewer' },
] as const;

const BUDGET_ROWS: readonly (readonly string[])[] = [
  ['Category', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Share', 'Status'],
  ['Salaries', '120000', '122000', '125000', '128000'],
  ['Rent', '18000', '18000', '18000', '18000'],
  ['Cloud & hosting', '6400', '7100', '7900', '8800'],
  ['Travel', '4200', '6100', '3900', '7300'],
  ['Training', '2500', '1800', '3200', '2100'],
  ['Equipment', '9000', '1500', '2200', '11000'],
];

function budgetCells(
  sheetId: string,
  ratesSheetName: string,
): { sheetId: string; row: number; col: number; raw: string }[] {
  const cells: { sheetId: string; row: number; col: number; raw: string }[] = [];
  BUDGET_ROWS.forEach((row, r) =>
    row.forEach((raw, c) => cells.push({ sheetId, row: r, col: c, raw })),
  );
  const last = BUDGET_ROWS.length; // 1-based row number of the last category
  for (let r = 2; r <= last; r += 1) {
    cells.push({ sheetId, row: r - 1, col: 5, raw: `=SUM(B${r}:E${r})` });
    cells.push({ sheetId, row: r - 1, col: 6, raw: `=ROUND(F${r}/$F$${last + 2}*100,1)` });
    cells.push({
      sheetId,
      row: r - 1,
      col: 7,
      raw: `=IF(F${r}>VLOOKUP(A${r},'${ratesSheetName}'!A2:B7,2,FALSE),"Over","OK")`,
    });
  }
  const total = last + 2;
  cells.push({ sheetId, row: total - 1, col: 0, raw: 'Grand total' });
  for (const [col, letter] of [
    [1, 'B'],
    [2, 'C'],
    [3, 'D'],
    [4, 'E'],
    [5, 'F'],
  ] as const) {
    cells.push({ sheetId, row: total - 1, col, raw: `=SUM(${letter}2:${letter}${last})` });
  }
  cells.push({ sheetId, row: total, col: 0, raw: 'Largest line item' });
  cells.push({
    sheetId,
    row: total,
    col: 1,
    raw: `=INDEX(A2:A${last},MATCH(MAX(F2:F${last}),F2:F${last},0))`,
  });
  cells.push({ sheetId, row: total + 1, col: 0, raw: 'Average quarter' });
  cells.push({ sheetId, row: total + 1, col: 1, raw: `=AVERAGE(B${total}:E${total})` });
  cells.push({ sheetId, row: total + 2, col: 0, raw: 'Items over budget' });
  cells.push({ sheetId, row: total + 2, col: 1, raw: `=COUNTIF(H2:H${last},"Over")` });
  cells.push({ sheetId, row: total + 3, col: 0, raw: 'Broken on purpose' });
  cells.push({ sheetId, row: total + 3, col: 1, raw: '=B2/0' });
  return cells;
}

function limitCells(sheetId: string): { sheetId: string; row: number; col: number; raw: string }[] {
  const limits = [
    ['Category', 'Annual limit'],
    ['Salaries', '500000'],
    ['Rent', '72000'],
    ['Cloud & hosting', '28000'],
    ['Travel', '20000'],
    ['Training', '10000'],
    ['Equipment', '20000'],
  ];
  return limits.flatMap((row, r) => row.map((raw, c) => ({ sheetId, row: r, col: c, raw })));
}

export async function seedDemoData(db: Db, logger: Pick<Logger, 'info'>): Promise<void> {
  const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [DEMO_USERS[0].email]);
  if (existing.rowCount) {
    logger.info('demo data already present; skipping seed');
    return;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await withTransaction(db, async (tx) => {
    const { rows: orgRows } = await tx.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Northwind Finance') RETURNING id`,
    );
    const orgId = orgRows[0]!.id;
    let ownerId = '';
    for (const user of DEMO_USERS) {
      const { rows } = await tx.query<{ id: string }>(
        'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [user.email, user.displayName, passwordHash],
      );
      await tx.query(
        'INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [orgId, rows[0]!.id, user.role],
      );
      if (user.role === 'owner') ownerId = rows[0]!.id;
    }

    const workbook = await repo.insertWorkbook(tx, orgId, 'Quarterly budget FY26', ownerId);
    const budget = await repo.insertSheet(tx, workbook.id, 'Budget', 0);
    const limits = await repo.insertSheet(tx, workbook.id, 'Limits', 1);
    const engine = RecalcEngine.create(
      [
        { id: budget.id, name: budget.name },
        { id: limits.id, name: limits.name },
      ],
      [],
    );
    const result = engine.applyEdits([
      ...limitCells(limits.id),
      ...budgetCells(budget.id, limits.name),
    ]);
    await repo.persistCells(tx, workbook.id, 2, result.changed);
    await repo.bumpRevision(tx, workbook.id, 2);
    await repo.insertRevision(tx, {
      workbookId: workbook.id,
      revision: 2,
      actorUserId: ownerId,
      kind: 'cells',
      editCount: result.changed.length,
      recalculated: result.evaluated,
      payload: { seed: true },
    });
    logger.info(
      { cells: result.changed.length, formulas: result.evaluated },
      'seeded demo workbook',
    );
  });
}
