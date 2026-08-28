import type { Spell } from '../../types';
import type { SpellSyncProgress } from './sync';
import { commitSyncedSpells } from './sync';
import {
  NETHYS_CORE_SOURCES,
  nethysToSpell,
  uniquifyNethysSpellId,
  type NethysSpell,
} from './normalize-nethys';

export const NETHYS_SEARCH_URL = 'https://elasticsearch.aonprd.com/aon/_search';
export const NETHYS_PAGE_SIZE = 100;

interface EsSearchResponse {
  hits?: {
    total?: { value?: number } | number;
    hits?: {
      _id: string;
      _source?: NethysSpell;
      sort?: unknown[];
    }[];
  };
}

function totalHits(
  hits: EsSearchResponse['hits'],
): number | undefined {
  const total = hits?.total;
  if (typeof total === 'number') return total;
  if (total && typeof total.value === 'number') return total.value;
  return undefined;
}

async function nethysErrorMessage(res: Response): Promise<string> {
  const fallback = `Archives of Nethys request failed: ${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as {
      error?: { reason?: string; root_cause?: { reason?: string }[] };
    };
    const reason =
      body.error?.root_cause?.[0]?.reason ?? body.error?.reason;
    return reason ? `Archives of Nethys request failed (${res.status}): ${reason}` : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchNethysCoreSpells(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<Spell[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const pageSize = opts?.pageSize ?? NETHYS_PAGE_SIZE;
  const out: Spell[] = [];
  const taken = new Set<string>();
  let from = 0;
  let catalogTotal: number | undefined;

  for (;;) {
    const body = {
      size: pageSize,
      from,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { term: { category: 'spell' } },
            { terms: { 'primary_source.keyword': [...NETHYS_CORE_SOURCES] } },
          ],
        },
      },
    };

    const res = await fetchImpl(NETHYS_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(await nethysErrorMessage(res));
    }

    const data = (await res.json()) as EsSearchResponse;
    const hits = data.hits?.hits ?? [];
    catalogTotal = totalHits(data.hits) ?? catalogTotal;

    for (const hit of hits) {
      const mapped = nethysToSpell(hit._source ?? {}, 'synced');
      if (!mapped) continue;
      const unique = uniquifyNethysSpellId(mapped, hit._id, taken);
      taken.add(unique.id);
      out.push(unique);
    }

    onProgress?.({
      fetched: out.length,
      total: catalogTotal,
      phase: 'fetch',
      message: `Fetched ${out.length}${catalogTotal != null ? ` / ${catalogTotal}` : ''} (Player Core)`,
    });

    if (hits.length === 0 || hits.length < pageSize) break;
    from += hits.length;
    if (!opts?.fetchImpl) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return out;
}

let inflight: Promise<{ count: number; retired: number }> | null = null;

/**
 * Atomic Archives of Nethys spell sync for pf2e — Player Core + Player Core 2 only.
 * Touches only origin === 'synced'. Never deletes homebrew or bundled.
 */
export async function syncNethysSpells(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<{ count: number; retired: number }> {
  if (inflight && !opts?.fetchImpl) return inflight;
  const run = runNethysSpellSync(onProgress, opts);
  if (!opts?.fetchImpl) {
    inflight = run.finally(() => {
      inflight = null;
    });
  }
  return run;
}

async function runNethysSpellSync(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<{ count: number; retired: number }> {
  onProgress?.({
    fetched: 0,
    phase: 'fetch',
    message: 'Starting Archives of Nethys spell sync (Player Core)…',
  });
  const incoming = await fetchNethysCoreSpells(onProgress, opts);
  return commitSyncedSpells('pf2e', incoming, onProgress);
}
