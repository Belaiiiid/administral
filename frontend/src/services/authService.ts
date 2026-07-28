import type {
  AuthMessageResponse,
  AuthTokenResponse,
  AuthUser,
  LoginCredentials,
  RegisterPayload,
  ResetPasswordPayload,
} from '@/types';
import { apiClient } from './apiClient';

/**
 * Authentication API.
 *
 * Interface + implementation together, unlike the mock-first services: there is
 * a real backend for this from day one (the auth module), so there is nothing to
 * stub. The session store calls these; components call the store.
 */
export interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthTokenResponse>;
  register(payload: RegisterPayload): Promise<AuthTokenResponse>;
  /** The current user, resolved from the stored token. 401 if it is invalid. */
  me(): Promise<AuthUser>;

  /** Redeem the token from a confirmation link. No session required. */
  verifyEmail(token: string): Promise<AuthUser>;
  /** Ask for a fresh confirmation link. Requires a session. */
  resendVerification(): Promise<AuthMessageResponse>;

  /**
   * Ask for a reset link. Resolves identically for a registered and an
   * unregistered address — the backend will not say which, and neither may the
   * UI built on top of it.
   */
  requestPasswordReset(email: string): Promise<AuthMessageResponse>;
  /** Redeem a reset token and set the new password. No session is issued. */
  resetPassword(payload: ResetPasswordPayload): Promise<AuthMessageResponse>;
}

export const authService: AuthService = {
  login: (credentials) => apiClient.post<AuthTokenResponse>('/auth/login', credentials),
  register: (payload) => apiClient.post<AuthTokenResponse>('/auth/register', payload),
  me: () => apiClient.get<AuthUser>('/auth/me'),

  verifyEmail: (token) => apiClient.post<AuthUser>('/auth/verify-email', { token }),
  resendVerification: () => apiClient.post<AuthMessageResponse>('/auth/verify-email/resend', {}),

  requestPasswordReset: (email) =>
    apiClient.post<AuthMessageResponse>('/auth/password-reset/request', { email }),
  resetPassword: (payload) => apiClient.post<AuthMessageResponse>('/auth/password-reset', payload),
};
