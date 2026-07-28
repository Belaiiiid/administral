import { useEffect } from 'react';

import { useUiStore } from '@/store/uiStore';

/**
 * Reflects the stored accessibility preferences onto <html> as classes, which
 * the CSS variables in index.css react to. Mounted once by <AppProviders />.
 */
export function useAccessibilityPreferences() {
  const accessibility = useUiStore((state) => state.accessibility);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('a11y-high-contrast', accessibility.highContrast);
    root.classList.toggle('a11y-large-text', accessibility.largeText);
    root.classList.toggle('a11y-keyboard-nav', accessibility.keyboardNavigation);
    root.classList.toggle('a11y-reduced-motion', accessibility.simplifiedInterface);
  }, [accessibility]);

  return accessibility;
}
