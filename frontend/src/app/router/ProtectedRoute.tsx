import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { useSessionStore, type SessionRole } from '@/store/sessionStore';

export interface ProtectedRouteProps {
  /** Restrict to a role. Omit to require authentication only. */
  role?: SessionRole;
}

/**
 * Route guard architecture — deliberately not enforcing anything yet.
 *
 * The session store currently returns an authenticated placeholder, so this
 * component is a pass-through. When the auth module lands, only
 * `sessionStore` changes and every guarded branch starts enforcing.
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
