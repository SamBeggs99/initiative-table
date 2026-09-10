import { useEffect, useState } from 'react';
import { cachedPortraitUrl, resolvePortraitUrl } from '../../lib/portrait-store';

/**
 * Resolve a portrait id to a displayable URL.
 *
 * `src` is the legacy data URL still present on un-migrated records; it wins
 * only when there is no id, so a record mid-migration renders either way.
 * A cache hit returns synchronously so a re-render never flashes an empty
 * frame.
 */
export function usePortraitUrl(
  portraitId: string | undefined,
  src?: string | null,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    portraitId ? cachedPortraitUrl(portraitId) : undefined,
  );

  useEffect(() => {
    if (!portraitId) {
      setUrl(undefined);
      return;
    }
    const hit = cachedPortraitUrl(portraitId);
    if (hit) {
      setUrl(hit);
      return;
    }
    let cancelled = false;
    void resolvePortraitUrl(portraitId).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [portraitId]);

  return portraitId ? url : (src ?? undefined);
}
