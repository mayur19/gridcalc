import { ERROR_CODES_HTTP, type ApiErrorCode } from '@gridcalc/shared';

/** Domain/application error carrying a stable machine-readable code. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_CODES_HTTP[code];
  }
}

export const notFound = (what: string): AppError => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (
  message = 'You do not have permission to perform this action',
): AppError => new AppError('FORBIDDEN', message);
export const unauthenticated = (): AppError =>
  new AppError('UNAUTHENTICATED', 'Sign in to continue');
