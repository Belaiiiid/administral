import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { useSessionStore, type SessionRole } from '@/store/sessionStore';

export interface ProtectedRouteProps {
  /** Restrict to a role. Omit to require authentication only. */
  role?: SessionRole;
}

/**
 * Route guard.
 *
 * Reads the JWT-backed `sessionStore`: unauthenticated visitors are sent to the
 * login page (remembering where they came from), and an authenticated user who
 * lacks the required role is bounced to the citizen portal. The role check
 * folds ADMIN in with the agents (see `sessionStore.toSessionRole`).
 */
export function ProtectedRoute({ role }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, role: currentRole } = useSessionStore();

  if (!isAuthenticated) {
    // `state.from` lets the login page return the user where they came from.
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }

  if (role && currentRole !== role) {
    return <Navigate to={ROUTES.portal} replace />;
  }

  return <Outlet />;
}
