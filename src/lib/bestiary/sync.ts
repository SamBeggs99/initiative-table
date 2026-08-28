import type { StatBlock, System } from '../../types';
import { fetchOpen5ePages } from '../open5e-page';
import { bestiaryDb, metaKey } from './db';
import type { Open5eMonster } from './normalize-open5e';
import { open5eToStatBlock } from './normalize-open5e';

const OPEN5E_PAGE = 'https://api.open5e.com/v1/monsters/?limit=500';

export interface SyncProgress {
  fetched: number;
  total?: number;
  phase: 'fetch' | 'validate' | 'commit' | 'done' | 'aborted';
  message?: string;
}

export class SyncAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncAbortedError';
  }
}

async function fetchAllOpen5e(
  onProgress?: (p: SyncProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<StatBlock[]> {
  return fetchOpen5ePages<Open5eMonster, StatBlock>(
    OPEN5E_PAGE,
    (raw) => open5eToStatBlock(raw, 'synced'),
    (fetched, total) =>
      onProgress?.({
        fetched,
        total,
        phase: 'fetch',
        message: `Fetched ${fetched}${total != null ? ` / ${total}` : ''}`,
      }),
    fetchImpl,
  );
}

let inflight: Promise<{ count: number; retired: number }> | null = null;

/**
 * Atomic swap of `origin: 'synced'` rows for one system.
 * Never deletes homebrew or bundled. Aborts if count drops >20% vs last sync.
 */
export async function commitSyncedCreatures(
  system: System,
  incoming: StatBlock[],
  onProgress?: (p: SyncProgress) => void,
): Promise<{ count: number; retired: number }> {
  onProgress?.({
    fetched: incoming.length,
    phase: 'validate',
    message: 'Validating sync size…',
  });

  const meta = await bestiaryDb.meta.get(metaKey(system));
  if (
    meta?.lastSyncedCount != null &&
    meta.lastSyncedCount > 0 &&
    incoming.length < meta.lastSyncedCount * 0.8
  ) {
    onProgress?.({
      fetched: incoming.length,
      phase: 'aborted',
      message: `Aborted: fetched ${incoming.length} vs last sync ${meta.lastSyncedCount} (>20% drop).`,
    });
    throw new SyncAbortedError(
      `Sync aborted: new count ${incoming.length} is more than 20% below last sync (${meta.lastSyncedCount}). Previous bestiary left intact.`,
    );
  }

  await bestiaryDb.creaturesStaging.clear();
  await bestiaryDb.creaturesStaging.bulkPut(incoming);

  onProgress?.({
    fetched: incoming.length,
    phase: 'commit',
    message: 'Committing sync…',
  });

  let retired = 0;

  await bestiaryDb.transaction(
    'rw',
    bestiaryDb.creatures,
    bestiaryDb.creaturesStaging,
    bestiaryDb.meta,
    async () => {
      const staged = await bestiaryDb.creaturesStaging.toArray();
      const stagedById = new Map(staged.map((c) => [c.id, c]));

      const existingSynced = await bestiaryDb.creatures
        .where('[system+origin]')
        .equals([system, 'synced'])
        .toArray();

      for (const old of existingSynced) {
        if (!stagedById.has(old.id)) {
          await bestiaryDb.creatures.put({ ...old, retired: true });
          retired += 1;
        }
      }

      for (const creature of staged) {
        const prev = await bestiaryDb.creatures.get(creature.id);
        await bestiaryDb.creatures.put({
          ...creature,
          origin: 'synced',
          retired: false,
          portraitDataUrl: prev?.portraitDataUrl ?? creature.portraitDataUrl,
        });
      }

      await bestiaryDb.creaturesStaging.clear();

      const retiredCount = await bestiaryDb.creatures
        .where('[system+origin]')
        .equals([system, 'synced'])
        .filter((c) => c.retired === true)
        .count();

      await bestiaryDb.meta.put({
        key: metaKey(system),
        lastSyncedAt: Date.now(),
        lastSyncedCount: staged.length,
        retiredCount,
      });
    },
  );

  onProgress?.({
    fetched: incoming.length,
    phase: 'done',
    message: `Synced ${incoming.length} creatures (${retired} retired).`,
  });

  return { count: incoming.length, retired };
}

/**
 * Atomic Open5e sync for dnd5e.
 * Touches only origin === 'synced'. Never deletes homebrew or bundled.
 */
export async function syncOpen5eBestiary(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch },
): Promise<{ count: number; retired: number }> {
  if (inflight && !opts?.fetchImpl) return inflight;
  const run = runOpen5eBestiarySync(onProgress, opts);
  if (!opts?.fetchImpl) inflight = run.finally(() => {
    inflight = null;
  });
  return run;
}

async function runOpen5eBestiarySync(
  onProgress?: (p: SyncProgress) => void,
  opts?: { fetchImpl?: typeof fetch },
): Promise<{ count: number; retired: number }> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  onProgress?.({ fetched: 0, phase: 'fetch', message: 'Starting Open5e sync…' });
  const incoming = await fetchAllOpen5e(onProgress, fetchImpl);
  return commitSyncedCreatures('dnd5e', incoming, onProgress);
}

export async function getBestiaryStats(system: System): Promise<{
  totalVisible: number;
  synced: number;
  bundled: number;
  homebrew: number;
  retired: number;
  lastSyncedAt?: number;
}> {
  const all = await bestiaryDb.creatures.where('system').equals(system).toArray();
  const synced = all.filter((c) => c.origin === 'synced' && !c.retired);
  const bundled = all.filter((c) => c.origin === 'bundled');
  const homebrew = all.filter((c) => c.origin === 'homebrew');
  const retired = all.filter((c) => c.origin === 'synced' && c.retired);
  const meta = await bestiaryDb.meta.get(metaKey(system));

  // Visible search set size ≈ synced + bundled not superseded + homebrew
  const syncedSlugs = new Set(synced.map((c) => c.slug));
  const bundledVisible = bundled.filter((c) => !syncedSlugs.has(c.slug));

  return {
    totalVisible: synced.length + bundledVisible.length + homebrew.length,
    synced: synced.length,
    bundled: bundled.length,
    homebrew: homebrew.length,
    retired: retired.length,
    lastSyncedAt: meta?.lastSyncedAt,
  };
}

/** Resolve by id — includes retired synced records. */
export async function getCreatureById(id: string): Promise<StatBlock | undefined> {
  return bestiaryDb.creatures.get(id);
}
