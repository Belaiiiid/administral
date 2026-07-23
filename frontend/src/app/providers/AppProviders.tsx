import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useAccessibilityPreferences } from '@/hooks/useAccessibilityPreferences';
import { useSessionStore } from '@/store/sessionStore';

/**
 * Composition root for cross-cutting providers.
 *
 * Future modules plug in here: a data-fetching client (TanStack Query), an i18n
 * provider. Keeping the tree in one file makes that ordering explicit rather
 * than scattered across main.tsx.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Applies persisted accessibility preferences to the document root.
  useAccessibilityPreferences();

  // Validate any stored token once at start: it confirms the identity (and its
  // role) with the server, and a token that expired since the last visit is
  // cleared here rather than surfacing as a failed request mid-navigation.
  const bootstrap = useSessionStore((state) => state.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return <>{children}</>;
}
