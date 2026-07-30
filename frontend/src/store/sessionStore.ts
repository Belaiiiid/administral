import { create } from 'zustand';

import type {
  AdministrationId,
  AuthRole,
  AuthUser,
  LoginCredentials,
  RegisterPayload,
} from '@/types';
import { ApiClientError } from '@/services/apiClient';
import { authService } from '@/services/authService';
import { clearToken, getToken, setToken } from '@/services/authToken';
import { useNotificationStore } from '@/store/notificationStore';

export type SessionRole = 'citizen' | 'agent' | 'admin';

const toSessionRole = (role: AuthRole): SessionRole => {
  if (role === 'CITIZEN') return 'citizen';
  if (role === 'ADMIN') return 'admin';
  return 'agent';
};

interface SessionState {
  isAuthenticated: boolean;
  role: SessionRole;
  user: AuthUser | null;
  displayName: string | null;
  activatedServices: AdministrationId[];
  isLoggingIn: boolean;
  /** Last login error message, for the form to display. */
  error: string | null;
  /** Error code from the backend, for conditional UI (e.g. EMAIL_NOT_VERIFIED). */
  errorCode: string | null;

  login: (credentials: LoginCredentials) => Promise<SessionRole>;
  register: (payload: RegisterPayload) => Promise<SessionRole>;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  isAuthenticated: getToken() !== null,
  role: 'citizen',
  user: null,
  displayName: null,
  activatedServices: [],
  isLoggingIn: false,
  error: null,
  errorCode: null,

  login: async (credentials) => {
    set({ isLoggingIn: true, error: null, errorCode: null });
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
        errorCode: null,
      });
      return role;
    } catch (cause) {
      let message = 'La connexion a échoué. Réessayez.';
      let code: string | null = null;
      if (cause instanceof ApiClientError) {
        message = cause.payload.message;
        code = cause.payload.code;
      } else if (cause instanceof Error) {
        message = cause.message;
      }
      set({ isLoggingIn: false, error: message, errorCode: code });
      throw cause;
    }
  },

  register: async (payload) => {
    set({ isLoggingIn: true, error: null, errorCode: null });
    try {
      const response = await authService.register(payload);
      setToken(response.accessToken);
      const role = toSessionRole(response.user.role);

      set({
        isAuthenticated: true,
        role,
        user: response.user,
        displayName: `${response.user.firstName} ${response.user.lastName}`,
        isLoggingIn: false,
        error: null,
        errorCode: null,
      });
      return role;
    } catch (cause) {
      let message = 'La création du compte a échoué. Réessayez.';
      let code: string | null = null;
      if (cause instanceof ApiClientError) {
        message = cause.payload.message;
        code = cause.payload.code;
      } else if (cause instanceof Error) {
        message = cause.message;
      }
      set({ isLoggingIn: false, error: message, errorCode: code });
      throw cause;
    }
  },

  logout: () => {
    clearToken();
    useNotificationStore.getState().reset();
    set({
      isAuthenticated: false,
      role: 'citizen',
      user: null,
      displayName: null,
      error: null,
      errorCode: null,
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
