import { useEffect, useState } from 'react';

/** Subscribe to a CSS media query. SSR-safe (returns false before hydration). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Tailwind `lg` breakpoint — the desktop/mobile shell boundary. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
