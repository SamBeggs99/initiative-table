export interface Open5ePage<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

/**
 * Fetch an Open5e (or compatible) paginated list.
 * First page is sequential so we know `count`; remaining pages run in parallel.
 */
export async function fetchOpen5ePages<T, R>(
  firstUrl: string,
  mapItem: (raw: T) => R,
  onProgress?: (fetched: number, total?: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<R[]> {
  const firstRes = await fetchImpl(firstUrl);
  if (!firstRes.ok) {
    throw new Error(`Open5e request failed: ${firstRes.status} ${firstRes.statusText}`);
  }
  const first = (await firstRes.json()) as Open5ePage<T>;
  const pageResults = first.results ?? [];
  const mapped: R[] = pageResults.map(mapItem);
  const total = typeof first.count === 'number' ? first.count : undefined;
  onProgress?.(mapped.length, total);

  const pageUrls = remainingPageUrls(firstUrl, first.next ?? null, pageResults.length, total);
  if (pageUrls.length === 0) return mapped;

  const rest = await Promise.all(
    pageUrls.map(async (url) => {
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`Open5e request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as Open5ePage<T>;
      return (data.results ?? []).map(mapItem);
    }),
  );

  for (const chunk of rest) mapped.push(...chunk);
  onProgress?.(mapped.length, total);
  return mapped;
}

/** Build page=2..N URLs from the first request, preferring the API's `next` shape. */
export function remainingPageUrls(
  firstUrl: string,
  next: string | null,
  firstPageSize: number,
  total?: number,
): string[] {
  if (!next || firstPageSize <= 0) return [];
  const pages =
    total != null && total > 0
      ? Math.ceil(total / firstPageSize)
      : null;
  if (pages != null && pages <= 1) return [];

  const template = new URL(next, firstUrl);
  const last = pages ?? 2;
  const urls: string[] = [];
  for (let page = 2; page <= last; page++) {
    template.searchParams.set('page', String(page));
    urls.push(template.toString());
  }
  // If the API didn't give a count, follow only `next` (caller would loop).
  // With a count we already generated 2..N.
  if (pages == null) return [next];
  return urls;
}
