/** Server-side account roles. Mirrors the backend `Role` enum. */
export type AuthRole = 'CITIZEN' | 'AGENT' | 'ADMIN';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: AuthRole;
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
