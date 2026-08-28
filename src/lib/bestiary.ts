import type { StatBlock } from '../types';
import { notifyCloudDirty } from './cloud/dirty';
import { bestiaryDb } from './bestiary/db';
import { newHomebrewId, slugifyName } from './bestiary/ids';

export { bestiaryDb } from './bestiary/db';
export {
  deterministicCreatureId,
  isDeterministicCreatureId,
  newHomebrewId,
  slugifyName,
} from './bestiary/ids';
export { open5eToStatBlock } from './bestiary/normalize-open5e';
export {
  nethysToStatBlock,
  NETHYS_CREATURE_SOURCES,
} from './bestiary/normalize-nethys';
export { ensureBundledSeeded, getBundledCount } from './bestiary/seed';
export {
  commitSyncedCreatures,
  getBestiaryStats,
  getCreatureById,
  SyncAbortedError,
  syncOpen5eBestiary,
} from './bestiary/sync';
export {
  fetchNethysCoreCreatures,
  syncNethysBestiary,
} from './bestiary/sync-nethys';
export type { SyncProgress } from './bestiary/sync';
export {
  provenanceBadge,
  searchCreatures,
} from './bestiary/search';
export type {
  CreatureSearchResult,
  ProvenanceBadge,
  SearchCreaturesQuery,
} from './bestiary/search';
export {
  buildCombatantsFromStatBlock,
  previewAverageHp,
} from './bestiary/add-to-combat';
export type { AddCreaturesOptions } from './bestiary/add-to-combat';
export { unresolvedCreatureLabel } from './bestiary/resolve';

export async function saveHomebrewCreature(
  partial: Omit<StatBlock, 'origin'> & { id?: string; origin?: StatBlock['origin'] },
): Promise<StatBlock> {
  const now = Date.now();
  const { origin: _ignored, ...rest } = partial;
  void _ignored;
  const record: StatBlock = {
    ...rest,
    id: partial.id ?? newHomebrewId(),
    origin: 'homebrew',
    slug: partial.slug || slugifyName(partial.name),
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  };
  await bestiaryDb.creatures.put(record);
  notifyCloudDirty();
  return record;
}

export async function deleteHomebrewCreature(id: string): Promise<boolean> {
  const existing = await bestiaryDb.creatures.get(id);
  if (!existing || existing.origin !== 'homebrew') return false;
  await bestiaryDb.creatures.delete(id);
  notifyCloudDirty();
  return true;
}

/** Drop homebrew creatures scoped to a campaign. Global homebrew is left alone. */
export async function deleteHomebrewCreaturesForCampaign(
  campaignId: string,
): Promise<number> {
  const rows = await bestiaryDb.creatures
    .where('campaignId')
    .equals(campaignId)
    .toArray();
  const ids = rows.filter((c) => c.origin === 'homebrew').map((c) => c.id);
  if (ids.length === 0) return 0;
  await bestiaryDb.creatures.bulkDelete(ids);
  notifyCloudDirty();
  return ids.length;
}

/** Attach or clear portrait art on any bestiary record (homebrew / bundled / synced). */
export async function setCreaturePortrait(
  id: string,
  portraitDataUrl: string | undefined,
): Promise<StatBlock | null> {
  const existing = await bestiaryDb.creatures.get(id);
  if (!existing) return null;
  const record: StatBlock = {
    ...existing,
    portraitDataUrl: portraitDataUrl || undefined,
    updatedAt: Date.now(),
  };
  await bestiaryDb.creatures.put(record);
  if (record.origin === 'homebrew') notifyCloudDirty();
  return record;
}

export async function cloneToHomebrew(
  source: StatBlock,
  opts?: { campaignId?: string; nameSuffix?: string },
): Promise<StatBlock> {
  const now = Date.now();
  const name = `${source.name}${opts?.nameSuffix ?? ' (custom)'}`;
  const record: StatBlock = {
    ...structuredClone(source),
    id: newHomebrewId(),
    origin: 'homebrew',
    campaignId: opts?.campaignId,
    name,
    slug: slugifyName(name),
    source: 'Homebrew',
    derivedFromId: source.id,
    retired: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await bestiaryDb.creatures.put(record);
  notifyCloudDirty();
  return record;
}
