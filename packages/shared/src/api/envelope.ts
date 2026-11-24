/** Consistent JSON envelope used by every API response. */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ApiEnvelope<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly meta?: Record<string, unknown>;
}

export const ERROR_CODES_HTTP = {
  VALIDATION_FAILED: 400,
  REGISTRATION_REJECTED: 400,
  UNAUTHENTICATED: 401,
  CSRF_TOKEN_INVALID: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REVISION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
} as const;

export type ApiErrorCode = keyof typeof ERROR_CODES_HTTP;
