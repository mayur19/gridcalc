import { z } from 'zod';
import { MAX_RAW_LENGTH } from '../formula/cell-input.js';
import { MAX_COLS, MAX_ROWS } from '../formula/references.js';

/** Request schemas shared by the API (validation) and the web client (typing). */
export const MAX_EDITS_PER_REQUEST = 1000;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200, 'Password must be at most 200 characters');

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const sheetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (name) => !/[\\/?*[\]:']/.test(name),
    'Sheet names cannot contain \\ / ? * [ ] : or quotes',
  );

export const createWorkbookSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateWorkbookInput = z.infer<typeof createWorkbookSchema>;

export const createSheetSchema = z.object({
  name: sheetNameSchema,
});
export type CreateSheetInput = z.infer<typeof createSheetSchema>;

export const cellEditSchema = z.object({
  sheetId: z.string().uuid(),
  row: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROWS - 1),
  col: z
    .number()
    .int()
    .min(0)
    .max(MAX_COLS - 1),
  raw: z.string().max(MAX_RAW_LENGTH),
});
export type CellEditInput = z.infer<typeof cellEditSchema>;

export const patchCellsSchema = z.object({
  baseRevision: z.number().int().min(0),
  edits: z.array(cellEditSchema).min(1).max(MAX_EDITS_PER_REQUEST),
});
export type PatchCellsInput = z.infer<typeof patchCellsSchema>;

export const parseFormulaSchema = z.object({
  formula: z.string().min(1).max(MAX_RAW_LENGTH),
});
