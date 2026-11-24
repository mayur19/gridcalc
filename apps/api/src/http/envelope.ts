import type { ApiEnvelope, ApiError } from '@gridcalc/shared';

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiEnvelope<T> {
  return meta === undefined ? { data, error: null } : { data, error: null, meta };
}

export function fail(error: ApiError): ApiEnvelope<never> {
  return { data: null, error };
}
