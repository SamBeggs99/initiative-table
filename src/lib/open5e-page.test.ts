import { describe, expect, it } from 'vitest';
import { fetchOpen5ePages, remainingPageUrls } from './open5e-page';

describe('remainingPageUrls', () => {
  it('returns nothing when there is no next page', () => {
    expect(
      remainingPageUrls('https://api.open5e.com/v1/monsters/?limit=500', null, 500, 400),
    ).toEqual([]);
  });

  it('builds parallel page URLs from the next-link template', () => {
    const urls = remainingPageUrls(
      'https://api.open5e.com/v1/monsters/?limit=500',
      'https://api.open5e.com/v1/monsters/?limit=500&page=2',
      500,
      1200,
    );
    expect(urls).toEqual([
      'https://api.open5e.com/v1/monsters/?limit=500&page=2',
      'https://api.open5e.com/v1/monsters/?limit=500&page=3',
    ]);
  });
});

describe('fetchOpen5ePages', () => {
  it('loads the first page then remaining pages in parallel', async () => {
    const seen: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      const page = url.includes('page=2') ? 2 : 1;
      return {
        ok: true,
        json: async () => ({
          count: 3,
          next: page === 1 ? 'https://api.example.com/v1/x/?limit=2&page=2' : null,
          results: page === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }],
        }),
      } as Response;
    };

    const items = await fetchOpen5ePages(
      'https://api.example.com/v1/x/?limit=2',
      (raw: { id: string }) => raw.id,
      undefined,
      fetchImpl as typeof fetch,
    );

    expect(items).toEqual(['a', 'b', 'c']);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe('https://api.example.com/v1/x/?limit=2');
    expect(seen[1]).toContain('page=2');
  });
});
