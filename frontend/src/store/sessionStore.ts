import { create } from 'zustand';

import type {
  AdministrationId,
  AuthRole,
  AuthUser,
  LoginCredentials,
  RegisterPayload,
} from '@/types';
import { authService } from '@/services/authService';
import { clearToken, getToken, setToken } from '@/services/authToken';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Authenticated session.
 *
 * This is the file the scaffolding always pointed at: `ProtectedRoute`, the
 * header and the sidebar read from here, and wiring real auth was always meant
 * to touch only this store. It now holds a real JWT-backed session.
 *
 * The token lives in `localStorage` (via `authToken`); this store holds the
 * decoded identity. On load it rehydrates `isAuthenticated` from the presence of
 * a token — the token is then validated server-side on the first real request,
 * and a 401 clears it.
 */

export type SessionRole = 'citizen' | 'agent';

/** Backend roles → the two front-end journeys. ADMIN travels with the agents. */
const toSessionRole = (role: AuthRole): SessionRole => (role === 'CITIZEN' ? 'citizen' : 'agent');

interface SessionState {
  isAuthenticated: boolean;
  role: SessionRole;
  user: AuthUser | null;
  displayName: string | null;
  activatedServices: AdministrationId[];
  /** True while a login request is in flight. */
  isLoggingIn: boolean;
  /** Last login error message, for the form to display. */
  error: string | null;

  /** Authenticate. Resolves to the role on success so the caller can redirect. */
  login: (credentials: LoginCredentials) => Promise<SessionRole>;
  /** Create a citizen account and sign in. Resolves to the role for redirect. */
  register: (payload: RegisterPayload) => Promise<SessionRole>;
  logout: () => void;
  /** Rehydrate the identity from the stored token at app start. */
  bootstrap: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  // Optimistic: a stored token means "probably authenticated" until a request
  // proves otherwise. Avoids a login flash on every reload.
  isAuthenticated: getToken() !== null,
  role: 'citizen',
  user: null,
  displayName: null,
  activatedServices: [],
  isLoggingIn: false,
  error: null,

  login: async (credentials) => {
    set({ isLoggingIn: true, error: null });
    try {
      const response = await authService.login(credentials);
      setToken(response.accessToken);
      const role = toSessionRole(response.user.role);

      set({
        isAuthenticated: true,
        role,
        user: response.user,
        displayName: `${response.user.firstName} ${response.user.lastName}`,
        isLoggingIn: false,
        error: null,
      });
      return role;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'La connexion a échoué. Réessayez.';
      set({ isLoggingIn: false, error: message });
      throw cause;
    }
  },

  register: async (payload) => {
    set({ isLoggingIn: true, error: null });
    try {
      const response = await authService.register(payload);
      setToken(response.accessToken);
      const role = toSessionRole(response.user.role); // public registration is always CITIZEN

      set({
        isAuthenticated: true,
        role,
        user: response.user,
        displayName: `${response.user.firstName} ${response.user.lastName}`,
        isLoggingIn: false,
        error: null,
      });
      return role;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'La création du compte a échoué. Réessayez.';
      set({ isLoggingIn: false, error: message });
      throw cause;
    }
  },

  logout: () => {
    clearToken();
    // Drop the previous account's notifications so the next sign-in never
    // briefly shows a stale badge or another user's rows.
    useNotificationStore.getState().reset();
    set({
      isAuthenticated: false,
      role: 'citizen',
      user: null,
      displayName: null,
      error: null,
    });
  },

  bootstrap: async () => {
    if (getToken() === null) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const user = await authService.me();
      set({
        isAuthenticated: true,
        role: toSessionRole(user.role),
        user,
        displayName: `${user.firstName} ${user.lastName}`,
      });
    } catch {
      // Token invalid/expired — apiClient already cleared it.
      set({ isAuthenticated: false, role: 'citizen', user: null, displayName: null });
    }
  },
}));
