import type { ApiEnvelope } from '@gridcalc/shared';

/** Thin fetch wrapper: JSON envelope, same-origin cookies, CSRF header on mutations. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiResult<T> {
  readonly data: T;
  readonly meta?: Record<string, unknown>;
}

const CSRF_COOKIE = 'gc_csrf';

export function readCookie(name: string, source: string = document.cookie): string | null {
  for (const part of source.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK',
      'Cannot reach the server. Check your connection and try again.',
    );
  }
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }
  if (!response.ok || !envelope || envelope.error) {
    const error = envelope?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return envelope.meta === undefined
    ? { data: envelope.data as T }
    : { data: envelope.data as T, meta: envelope.meta };
}
