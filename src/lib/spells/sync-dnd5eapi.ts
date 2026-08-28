import type { Spell } from '../../types';
import type { SpellSyncProgress } from './sync';
import { commitSyncedSpells } from './sync';
import {
  dnd5eApiToSpell,
  type Dnd5eApiRef,
  type Dnd5eApiSpell,
} from './normalize-dnd5eapi';

export const DND5EAPI_SPELLS_URL =
  'https://www.dnd5eapi.co/api/2014/spells';
export const DND5EAPI_ORIGIN = 'https://www.dnd5eapi.co';
export const DND5EAPI_CONCURRENCY = 8;

interface Dnd5eApiList {
  count?: number;
  results?: Dnd5eApiRef[];
}

async function apiErrorMessage(res: Response, label: string): Promise<string> {
  const fallback = `${label} failed: ${res.status} ${res.statusText}`;
  try {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    try {
      const body = JSON.parse(trimmed) as { error?: string | { message?: string } };
      const reason =
        typeof body.error === 'string'
          ? body.error
          : body.error?.message;
      return reason ? `${label} failed (${res.status}): ${reason}` : `${fallback} — ${trimmed.slice(0, 180)}`;
    } catch {
      return `${fallback} — ${trimmed.slice(0, 180)}`;
    }
  } catch {
    return fallback;
  }
}

function detailUrl(ref: Dnd5eApiRef): string | null {
  const path = ref.url?.trim();
  if (path?.startsWith('http')) return path;
  if (path?.startsWith('/')) return `${DND5EAPI_ORIGIN}${path}`;
  const index = ref.index?.trim();
  if (!index) return null;
  return `${DND5EAPI_SPELLS_URL}/${index}`;
}

export async function fetchDnd5eApiSpells(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; concurrency?: number },
): Promise<Spell[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const concurrency = Math.max(1, opts?.concurrency ?? DND5EAPI_CONCURRENCY);

  const listRes = await fetchImpl(DND5EAPI_SPELLS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!listRes.ok) {
    throw new Error(await apiErrorMessage(listRes, 'D&D 5e SRD API request'));
  }

  const list = (await listRes.json()) as Dnd5eApiList;
  const refs = list.results ?? [];
  const catalogTotal = list.count ?? refs.length;
  const out: Spell[] = [];

  for (let i = 0; i < refs.length; i += concurrency) {
    const chunk = refs.slice(i, i + concurrency);
    const details = await Promise.all(
      chunk.map(async (ref) => {
        const url = detailUrl(ref);
        if (!url) return null;
        const res = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(await apiErrorMessage(res, 'D&D 5e SRD API request'));
        }
        return (await res.json()) as Dnd5eApiSpell;
      }),
    );

    for (const raw of details) {
      if (!raw) continue;
      const mapped = dnd5eApiToSpell(raw, 'synced');
      if (mapped) out.push(mapped);
    }

    onProgress?.({
      fetched: out.length,
      total: catalogTotal,
      phase: 'fetch',
      message: `Fetched ${out.length}${catalogTotal != null ? ` / ${catalogTotal}` : ''} (SRD 5.1)`,
    });

    if (!opts?.fetchImpl && i + concurrency < refs.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return out;
}

let inflight: Promise<{ count: number; retired: number }> | null = null;

/**
 * Atomic 5e-bits SRD 5.1 spell sync for dnd5e.
 * Touches only origin === 'synced'. Never deletes homebrew or bundled.
 */
export async function syncDnd5eApiSpells(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; concurrency?: number },
): Promise<{ count: number; retired: number }> {
  if (inflight && !opts?.fetchImpl) return inflight;
  const run = runDnd5eApiSpellSync(onProgress, opts);
  if (!opts?.fetchImpl) {
    inflight = run.finally(() => {
      inflight = null;
    });
  }
  return run;
}

async function runDnd5eApiSpellSync(
  onProgress?: (p: SpellSyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch; concurrency?: number },
): Promise<{ count: number; retired: number }> {
  onProgress?.({
    fetched: 0,
    phase: 'fetch',
    message: 'Starting D&D 5e SRD API spell sync…',
  });
  const incoming = await fetchDnd5eApiSpells(onProgress, opts);
  return commitSyncedSpells('dnd5e', incoming, onProgress);
}
