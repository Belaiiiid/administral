/** Server-side account roles. Mirrors the backend `Role` enum. */
export type AuthRole = 'CITIZEN' | 'AGENT' | 'ADMIN';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: AuthRole;
  /** Whether the address has been confirmed via the emailed link. */
  isVerified: boolean;
  createdAt: string;
}

/** The login/register response — `POST /auth/login`, `POST /auth/register`. */
export interface AuthTokenResponse {
  accessToken: string;
  tokenType: string;
  /** Token lifetime in seconds — short, by design. */
  expiresIn: number;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * The uniform acknowledgement returned by endpoints that deliberately reveal
 * nothing — notably the password-reset request, which answers identically
 * whether or not the address has an account.
 */
export interface AuthMessageResponse {
  message: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface ProvisionStaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'AGENT' | 'ADMIN';
}
