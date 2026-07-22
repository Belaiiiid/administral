import type { ApiError } from '@/types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly payload: ApiError) {
    super(payload.message);
    this.name = 'ApiClientError';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...init } = options;
  const url = new URL(API_BASE_URL, window.location.origin);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const isFormData = body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    headers: { ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
  });
  if (!response.ok) {
    const raw = await response.json().catch(() => ({}));
    const payload: ApiError = {
      code: typeof raw.code === 'string' ? raw.code : 'http_error',
      message: typeof raw.message === 'string' ? raw.message : typeof raw.detail === 'string' ? raw.detail : 'Une erreur réseau est survenue.',
    };
    throw new ApiClientError(response.status, payload);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};
