import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from './errors.js';

/** Parses untrusted input with a zod schema, throwing a 400 VALIDATION_FAILED on failure. */
export function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Request validation failed',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
