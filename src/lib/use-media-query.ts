import { useEffect, useState } from 'react';

/**
 * Subscribe to a media query. Used to pick a genuinely different layout on a
 * phone rather than reflowing the desktop three-column grid into a 1,400px
 * scroll — see the mobile branch in App.tsx.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Below Tailwind's `md`, i.e. where the three-column layout stops fitting. */
export const NARROW_QUERY = '(max-width: 767px)';
