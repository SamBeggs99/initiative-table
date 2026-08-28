import type { Spell, System } from '../../types';
import { spellDb, spellMetaKey } from './db';

export interface SpellSyncProgress {
  fetched: number;
  total?: number;
  phase: 'fetch' | 'validate' | 'commit' | 'done' | 'aborted';
  message?: string;
}

export class SpellSyncAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpellSyncAbortedError';
  }
}

/**
 * Atomic swap of `origin: 'synced'` rows for one system.
 * Never deletes homebrew or bundled. Aborts if count drops >20% vs last sync.
 */
export async function commitSyncedSpells(
  system: System,
  incoming: Spell[],
  onProgress?: (p: SpellSyncProgress) => void,
): Promise<{ count: number; retired: number }> {
  onProgress?.({
    fetched: incoming.length,
    phase: 'validate',
    message: 'Validating sync size…',
  });

  const meta = await spellDb.meta.get(spellMetaKey(system));
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
    throw new SpellSyncAbortedError(
      `Spell sync aborted: new count ${incoming.length} is more than 20% below last sync (${meta.lastSyncedCount}). Previous catalog left intact.`,
    );
  }

  await spellDb.spellsStaging.clear();
  await spellDb.spellsStaging.bulkPut(incoming);

  onProgress?.({
    fetched: incoming.length,
    phase: 'commit',
    message: 'Committing spell sync…',
  });

  let retired = 0;

  await spellDb.transaction(
    'rw',
    spellDb.spells,
    spellDb.spellsStaging,
    spellDb.meta,
    async () => {
      const staged = await spellDb.spellsStaging.toArray();
      const stagedById = new Map(staged.map((s) => [s.id, s]));

      const existingSynced = await spellDb.spells
        .where('[system+origin]')
        .equals([system, 'synced'])
        .toArray();

      for (const old of existingSynced) {
        if (!stagedById.has(old.id)) {
          await spellDb.spells.put({ ...old, retired: true });
          retired += 1;
        }
      }

      for (const spell of staged) {
        const prev = await spellDb.spells.get(spell.id);
        await spellDb.spells.put({
          ...spell,
          origin: 'synced',
          retired: false,
          createdAt: prev?.createdAt ?? spell.createdAt,
        });
      }

      await spellDb.spellsStaging.clear();

      const retiredCount = await spellDb.spells
        .where('[system+origin]')
        .equals([system, 'synced'])
        .filter((s) => s.retired === true)
        .count();

      await spellDb.meta.put({
        key: spellMetaKey(system),
        lastSyncedAt: Date.now(),
        lastSyncedCount: staged.length,
        retiredCount,
      });
    },
  );

  onProgress?.({
    fetched: incoming.length,
    phase: 'done',
    message: `Synced ${incoming.length} spells (${retired} retired).`,
  });

  return { count: incoming.length, retired };
}

export async function getSpellStats(system: System): Promise<{
  totalVisible: number;
  synced: number;
  bundled: number;
  homebrew: number;
  retired: number;
  lastSyncedAt?: number;
}> {
  const all = await spellDb.spells.where('system').equals(system).toArray();
  const synced = all.filter((s) => s.origin === 'synced' && !s.retired);
  const bundled = all.filter((s) => s.origin === 'bundled');
  const homebrew = all.filter((s) => s.origin === 'homebrew');
  const retired = all.filter((s) => s.origin === 'synced' && s.retired);
  const meta = await spellDb.meta.get(spellMetaKey(system));
  const syncedSlugs = new Set(synced.map((s) => s.slug));
  const bundledVisible = bundled.filter((s) => !syncedSlugs.has(s.slug));

  return {
    totalVisible: synced.length + bundledVisible.length + homebrew.length,
    synced: synced.length,
    bundled: bundled.length,
    homebrew: homebrew.length,
    retired: retired.length,
    lastSyncedAt: meta?.lastSyncedAt,
  };
}

export async function getSpellById(id: string): Promise<Spell | undefined> {
  return spellDb.spells.get(id);
}

export async function getSpellsByIds(ids: string[]): Promise<Spell[]> {
  if (ids.length === 0) return [];
  const rows = await spellDb.spells.bulkGet(ids);
  return rows.filter((s): s is Spell => s != null);
}
