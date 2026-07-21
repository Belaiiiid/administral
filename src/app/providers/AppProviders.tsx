import type { ReactNode } from 'react';

import { useAccessibilityPreferences } from '@/hooks/useAccessibilityPreferences';

/**
 * Composition root for cross-cutting providers.
 *
 * Future modules plug in here: a data-fetching client (TanStack Query), an i18n
 * provider, an auth provider. Keeping the tree in one file makes that ordering
 * explicit rather than scattered across main.tsx.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Applies persisted accessibility preferences to the document root.
  useAccessibilityPreferences();

  return <>{children}</>;
}
