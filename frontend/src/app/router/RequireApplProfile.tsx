import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { RouteFallback } from '@/app/router/RouteFallback';
import { dossierService } from '@/services/dossierService';

/**
 * Per-service profiling gate — today, APL's.
 *
 * Registration no longer forces the profiling assistant before the services
 * hub: each service asks its own questions, so the assistant only appears
 * once a citizen actually opens one that needs it. This guards the APL
 * routes (`/mon-dossier`, `/mon-dossier/suivi`) specifically, not the whole
 * citizen area — `/profile`, `/settings`, `/chat` stay reachable regardless.
 *
 * `profileComplete` is the same server-computed flag `PersonalizedDossierSchema`
 * already carries — one definition, checked here before the dossier data is
 * otherwise used. Fails open on a network error: a citizen must never be
 * trapped choosing between a broken assistant and a broken dossier.
 */
export function RequireApplProfile() {
  const location = useLocation();
  const [state, setState] = useState<'loading' | 'complete' | 'incomplete'>('loading');

  useEffect(() => {
    let cancelled = false;
    dossierService
      .getDossier()
      .then((dossier) => {
        if (!cancelled) setState(dossier.profileComplete ? 'complete' : 'incomplete');
      })
      .catch(() => {
        if (!cancelled) setState('complete');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') return <RouteFallback />;

  if (state === 'incomplete') {
    // `from` lets the onboarding step return the citizen to the service they
    // were opening, not always back to the hub (mirrors `ProtectedRoute`).
    return <Navigate to={ROUTES.onboardingProfilage} state={{ from: location }} replace />;
  }

  return <Outlet />;
}
