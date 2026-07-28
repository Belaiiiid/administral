/**
 * The JWT, persisted in `localStorage`.
 *
 * Deliberately a tiny module with no imports: `apiClient` reads the token from
 * here to set the `Authorization` header, and the session store writes it on
 * login. Keeping it dependency-free is what avoids a cycle between the client
 * and the store.
 *
 * `localStorage` (not memory) so a page reload keeps the session — the token is
 * short-lived and re-validated server-side on every request, and a reload
 * wiping the session on every refresh would be its own kind of broken.
 */

const TOKEN_KEY = 'monparcours.access_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // localStorage can throw in private-mode / SSR; treat as no token.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* nothing we can do; the request layer will just be unauthenticated */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
