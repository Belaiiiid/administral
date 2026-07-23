import type {
  AuthTokenResponse,
  AuthUser,
  LoginCredentials,
  RegisterPayload,
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
}

export const authService: AuthService = {
  login: (credentials) => apiClient.post<AuthTokenResponse>('/auth/login', credentials),
  register: (payload) => apiClient.post<AuthTokenResponse>('/auth/register', payload),
  me: () => apiClient.get<AuthUser>('/auth/me'),
};
