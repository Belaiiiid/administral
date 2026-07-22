import { useEffect } from 'react';

import { APP_CONFIG } from '@/app/config/app';

/**
 * Sets the document title. Announcing the page name matters for screen-reader
 * users navigating a SPA, where no full page load occurs.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — ${APP_CONFIG.name}`;
  }, [title]);
}
