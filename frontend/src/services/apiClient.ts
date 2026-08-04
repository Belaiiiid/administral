import type { ApiError } from '@/types';
import { clearToken, getToken } from './authToken';

/**
 * HTTP client.
 *
 * The single place the application talks to the network. Feature services build
 * on this and never call `fetch` directly, so auth headers, error normalisation
 * and retry policy have exactly one home.
 *
 * Default base URL is `/api`, which the Vite dev server proxies to the FastAPI
 * backend on :8000 (see `vite.config.ts`). Same-origin in development means no
 * CORS preflight and no `SameSite` exemptions when cookie auth arrives.
 * Deployments that serve the API from another origin set `VITE_API_BASE_URL`.
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
 * Serialises query parameters, dropping `undefined`.
 *
 * Dropping rather than sending `?status=undefined`: an absent filter and a
 * filter whose value is the string "undefined" mean very different things to a
 * server, and only one of them is intended.
 */
function buildQuery(params: RequestOptions['params']): string {
  if (!params) return '';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * Normalises a failure response into `ApiError`.
 *
 * The backend returns `{code, message}` for domain errors, but a 502 from a
 * proxy or a crash before the handler runs returns HTML. Parsing defensively
 * means a caller always receives an `ApiError`, never a JSON parse exception
 * masking the real status.
 */
async function toApiError(response: Response, authenticated: boolean): Promise<ApiError> {
  try {
    const payload = (await response.json()) as unknown;

    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as ApiError).message === 'string'
    ) {
      return payload as ApiError;
    }

    // FastAPI's own validation errors use `detail`, not `message`.
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      const { detail } = payload as { detail: unknown };

      /*
       * A 401, and a 403 sent without any credential, both mean the same thing:
       * there is no usable session. FastAPI's `HTTPBearer` answers a missing
       * `Authorization` header with 403 — not 401 — so this case cannot be
       * folded into the 401 branch. Reporting it as "Requête invalide" told a
       * citizen their submission was malformed at the exact moment their token
       * had merely expired.
       */
      if (response.status === 401 || (response.status === 403 && !authenticated)) {
        return {
          code: 'SESSION_EXPIRED',
          message:
            'Votre session a expiré. Reconnectez-vous, puis relancez l’action — rien n’a été envoyé.',
        };
      }

      // A role refusal carries a readable French sentence worth showing; a
      // validation error carries a list of field objects, which does not.
      if (typeof detail === 'string') {
        return { code: 'FORBIDDEN', message: detail };
      }

      return { code: 'VALIDATION_ERROR', message: `Requête invalide (${response.status}).` };
    }
  } catch {
    // Body was not JSON — fall through to the generic shape below.
  }

  return {
    code: 'HTTP_ERROR',
    message: `La requête a échoué (${response.status} ${response.statusText}).`,
  };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...init } = options;

  /*
   * FormData is sent as-is: the browser sets `multipart/form-data` with the
   * boundary, which a manual Content-Type would clobber. Everything else is
   * JSON. This is what lets file upload and JSON requests share one client.
   */
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const hasBody = body !== undefined;

  // The bearer token, when the user is logged in. Attached on every request so
  // the protected routes (the agent dossiers) are reachable; harmless on the
  // public ones, which ignore it.
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${buildQuery(params)}`, {
      ...init,
      headers: {
        ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(hasBody ? { body: isFormData ? (body as FormData) : JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    /*
     * `fetch` rejects only on network failure — a 500 resolves normally. This
     * is surfaced as an ApiClientError so callers handle one error type rather
     * than distinguishing "server said no" from "server did not answer".
     */
    throw new ApiClientError(0, {
      code: 'NETWORK_ERROR',
      message:
        'Le serveur est injoignable. Vérifiez que l’API est démarrée (http://localhost:8000).',
      details: { cause: [cause instanceof Error ? cause.message : String(cause)] },
    });
  }

  if (!response.ok) {
    // A 401 means the token is missing, expired (they are short-lived) or
    // invalid. Drop it so the app stops sending a dead credential; the session
    // store, watching for this, routes the user back to login.
    if (response.status === 401) clearToken();
    throw new ApiClientError(response.status, await toApiError(response, Boolean(token)));
  }

  // 204 has no body; calling .json() on it throws.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
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
