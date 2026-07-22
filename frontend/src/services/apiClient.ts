import type { ApiError } from '@/types';

/**
 * HTTP client placeholder.
 *
 * No call is issued today — the skeleton renders from local fixtures. The shape
 * below is what feature services will consume once the backend exists, so
 * wiring it later means implementing `request` and nothing else.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Query parameters, serialised and appended to the path. */
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiError,
  ) {
    super(payload.message);
    this.name = 'ApiClientError';
  }
}

/**
 * @todo Implement when the backend lands: auth header injection, 401 refresh,
 *       error normalisation into ApiClientError, request cancellation.
 */
export async function request<T>(_path: string, _options: RequestOptions = {}): Promise<T> {
  throw new Error(
    'apiClient.request() n’est pas encore implémenté — le socle utilise des données de démonstration.',
  );
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
