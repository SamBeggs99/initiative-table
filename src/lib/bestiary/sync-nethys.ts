import type { StatBlock } from '../../types';
import { commitSyncedCreatures, type SyncProgress } from './sync';
import {
  NETHYS_CREATURE_SOURCES,
  nethysToStatBlock,
  uniquifyNethysCreatureId,
  type NethysCreature,
} from './normalize-nethys';

export const NETHYS_SEARCH_URL = 'https://elasticsearch.aonprd.com/aon/_search';
export const NETHYS_PAGE_SIZE = 100;

type NethysSnapshotRow = NethysCreature & { _id?: string };

interface EsSearchResponse {
  hits?: {
    total?: { value?: number } | number;
    hits?: {
      _id: string;
      _source?: NethysCreature;
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

function mapNethysRows(
  rows: { _id: string; source: NethysCreature }[],
  onProgress?: (p: SyncProgress) => void,
  catalogTotal?: number,
): StatBlock[] {
  const out: StatBlock[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const mapped = nethysToStatBlock(row.source, 'synced');
    if (!mapped) continue;
    const unique = uniquifyNethysCreatureId(mapped, row._id, taken);
    taken.add(unique.id);
    out.push(unique);
  }
  onProgress?.({
    fetched: out.length,
    total: catalogTotal ?? out.length,
    phase: 'fetch',
    message: `Fetched ${out.length}${catalogTotal != null ? ` / ${catalogTotal}` : ''} (Monster Core)`,
  });
  return out;
}

function isMappedStatBlock(row: unknown): row is StatBlock {
  if (!row || typeof row !== 'object') return false;
  const r = row as Partial<StatBlock>;
  return r.system === 'pf2e' && typeof r.hpAvg === 'number' && Array.isArray(r.actions);
}

async function loadBundledNethysSnapshot(
  onProgress?: (p: SyncProgress) => void,
): Promise<StatBlock[]> {
  const mod = await import('../../data/nethys-monster-core.json', {
    with: { type: 'json' },
  });
  const loaded = (mod as { default?: unknown }).default ?? mod;
  const raw = Array.isArray(loaded) ? loaded : [];
  if (raw.length === 0) {
    throw new Error('Monster Core snapshot is empty');
  }
  onProgress?.({
    fetched: 0,
    total: raw.length,
    phase: 'fetch',
    message: 'Archives of Nethys blocked this origin — loading Monster Core snapshot…',
  });
  if (raw.length > 0 && isMappedStatBlock(raw[0])) {
    const mapped = (raw as StatBlock[]).map((c) => ({
      ...c,
      origin: 'synced' as const,
      retired: false,
    }));
    onProgress?.({
      fetched: mapped.length,
      total: mapped.length,
      phase: 'fetch',
      message: `Fetched ${mapped.length} / ${mapped.length} (Monster Core)`,
    });
    return mapped;
  }
  const rows = (raw as NethysSnapshotRow[]).map((row) => ({
    _id: row._id || row.id || row.name || 'creature',
    source: row,
  }));
  return mapNethysRows(rows, onProgress, rows.length);
}

async function fetchNethysFromNetwork(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<StatBlock[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const pageSize = opts?.pageSize ?? NETHYS_PAGE_SIZE;
  const collected: { _id: string; source: NethysCreature }[] = [];
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
            { term: { category: 'creature' } },
            { terms: { 'primary_source.keyword': [...NETHYS_CREATURE_SOURCES] } },
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
      collected.push({ _id: hit._id, source: hit._source ?? {} });
    }

    onProgress?.({
      fetched: collected.length,
      total: catalogTotal,
      phase: 'fetch',
      message: `Fetched ${collected.length}${catalogTotal != null ? ` / ${catalogTotal}` : ''} (Monster Core)`,
    });

    if (hits.length === 0 || hits.length < pageSize) break;
    from += hits.length;
    if (!opts?.fetchImpl) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return mapNethysRows(collected, onProgress, catalogTotal);
}

export async function fetchNethysCoreCreatures(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<StatBlock[]> {
  try {
    return await fetchNethysFromNetwork(onProgress, opts);
  } catch (err) {
    // Tests inject fetchImpl and must see live API errors. In the browser,
    // Nethys Elasticsearch only allows 2e.aonprd.com — fall back to snapshot.
    if (opts?.fetchImpl) throw err;
    console.warn(
      'Nethys live creature sync unavailable; using Monster Core snapshot',
      err instanceof Error ? err.message : err,
    );
    return await loadBundledNethysSnapshot(onProgress);
  }
}

let inflight: Promise<{ count: number; retired: number }> | null = null;

/**
 * Atomic Archives of Nethys creature sync for pf2e — Monster Core + Monster Core 2.
 * Touches only origin === 'synced'. Never deletes homebrew or bundled.
 */
export async function syncNethysBestiary(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<{ count: number; retired: number }> {
  if (inflight && !opts?.fetchImpl) return inflight;
  const run = runNethysBestiarySync(onProgress, opts);
  if (!opts?.fetchImpl) {
    inflight = run.finally(() => {
      inflight = null;
    });
  }
  return run;
}

async function runNethysBestiarySync(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; pageSize?: number },
): Promise<{ count: number; retired: number }> {
  onProgress?.({
    fetched: 0,
    phase: 'fetch',
    message: 'Starting Archives of Nethys creature sync (Monster Core)…',
  });
  const incoming = await fetchNethysCoreCreatures(onProgress, opts);
  return commitSyncedCreatures('pf2e', incoming, onProgress);
}
