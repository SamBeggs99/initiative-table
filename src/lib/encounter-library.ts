import type {
  Campaign,
  NpcRecord,
  SavedEncounter,
  StatBlock,
  System,
  Tracker,
} from '../types';
import type { Difficulty } from '../systems/types';
import { getSystemAdapter } from '../systems';
import { getCreatureById, saveHomebrewCreature, cloneToHomebrew } from './bestiary';

export interface EncounterFilters {
  query: string;
  system: System | 'all';
  /** Active campaign name/tag; empty = no tag filter. */
  campaignTag: string | null;
  /** When true, ignore campaignTag. */
  showAllTags: boolean;
  difficulty: string | 'all';
  neverRun: boolean;
}

export interface MissingCreatureDep {
  kind: 'creature';
  creatureId: string;
  nameSnapshot: string;
  reason: string;
  block?: StatBlock;
}

export interface MissingNpcDep {
  kind: 'npc';
  npcId: string;
  reason: string;
}

export type MissingDependency = MissingCreatureDep | MissingNpcDep;

export type DepResolution =
  | { action: 'promote'; creatureId: string }
  | { action: 'copy'; creatureId: string }
  | { action: 'omit'; creatureId?: string; npcId?: string };

/** Is this homebrew visible to the given campaign? */
export function isCreatureVisibleToCampaign(
  block: StatBlock,
  campaignId: string,
): boolean {
  if (block.origin !== 'homebrew') return !block.retired;
  if (block.campaignId == null || block.campaignId === '') return true;
  return block.campaignId === campaignId;
}

export function filterEncounters(
  encounters: SavedEncounter[],
  filters: EncounterFilters,
  liveDifficulty?: (e: SavedEncounter) => string | null,
): SavedEncounter[] {
  const q = filters.query.trim().toLowerCase();
  return encounters
    .filter((e) => {
      if (filters.system !== 'all' && e.system !== filters.system) return false;
      if (filters.neverRun && (e.timesRun ?? 0) > 0) return false;
      if (!filters.showAllTags && filters.campaignTag) {
        const tag = filters.campaignTag.toLowerCase();
        if (!e.campaignTags.some((t) => t.toLowerCase() === tag)) return false;
      }
      if (q && !e.name.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q)) {
        return false;
      }
      if (filters.difficulty !== 'all' && liveDifficulty) {
        const tier = liveDifficulty(e);
        if (tier !== filters.difficulty) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Recently run first, then newest created, then name — prep shelf priority.
      const ar = a.lastRunAt ?? 0;
      const br = b.lastRunAt ?? 0;
      if (br !== ar) return br - ar;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.name.localeCompare(b.name);
    });
}

export function duplicateEncounter(source: SavedEncounter): SavedEncounter {
  return {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: `${source.name} (copy)`,
    createdAt: Date.now(),
    lastRunAt: undefined,
    timesRun: 0,
  };
}

/** Scale all entry quantities by factor (min 1 each after scale). */
export function scaleEncounter(
  source: SavedEncounter,
  factor: number,
): SavedEncounter {
  const f = Math.max(0.25, factor);
  return {
    ...source,
    entries: source.entries.map((e) => ({
      ...e,
      quantity: Math.max(1, Math.round(e.quantity * f)),
    })),
  };
}

export function computeEncounterDifficulty(
  encounter: SavedEncounter,
  party: { level: number }[],
  monsters: { cr?: string; level?: number }[],
): Difficulty | null {
  if (party.length === 0) return null;
  const adapter = getSystemAdapter(encounter.system);
  const expanded: { cr?: string; level?: number }[] = [];
  for (let i = 0; i < encounter.entries.length; i++) {
    const entry = encounter.entries[i]!;
    const m = monsters[i];
    for (let q = 0; q < entry.quantity; q++) {
      expanded.push({
        cr: m?.cr,
        level: m?.level,
      });
    }
  }
  if (expanded.length === 0) {
    return {
      rawXp: 0,
      adjustedXp: 0,
      thresholds: {},
      tier: 'trivial',
    };
  }
  return adapter.encounterBudget(expanded, party);
}

/**
 * Resolve every creatureId / npcId for the active campaign.
 * Unreachable deps are listed — never load half-populated silently.
 */
export async function checkEncounterDependencies(
  encounter: SavedEncounter,
  campaign: Campaign,
): Promise<{ ok: true } | { ok: false; missing: MissingDependency[] }> {
  const missing: MissingDependency[] = [];

  for (const entry of encounter.entries) {
    const block = await getCreatureById(entry.creatureId);
    if (!block) {
      missing.push({
        kind: 'creature',
        creatureId: entry.creatureId,
        nameSnapshot: entry.nameSnapshot,
        reason: 'Not found in bestiary (deleted or never synced)',
      });
      continue;
    }
    if (block.system !== campaign.system) {
      missing.push({
        kind: 'creature',
        creatureId: entry.creatureId,
        nameSnapshot: entry.nameSnapshot,
        reason: `Wrong system (${block.system})`,
        block,
      });
      continue;
    }
    if (!isCreatureVisibleToCampaign(block, campaign.id)) {
      missing.push({
        kind: 'creature',
        creatureId: entry.creatureId,
        nameSnapshot: entry.nameSnapshot || block.name,
        reason: `Homebrew private to another campaign`,
        block,
      });
    }
  }

  for (const npcId of encounter.npcIds) {
    const npc = campaign.npcs.find((n) => n.id === npcId);
    if (!npc) {
      missing.push({
        kind: 'npc',
        npcId,
        reason: 'NPC not in this campaign’s roster',
      });
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export async function promoteHomebrewToGlobal(creatureId: string): Promise<StatBlock | null> {
  const block = await getCreatureById(creatureId);
  if (!block || block.origin !== 'homebrew') return null;
  return saveHomebrewCreature({ ...block, campaignId: undefined });
}

export async function copyHomebrewToCampaign(
  creatureId: string,
  campaignId: string,
): Promise<StatBlock | null> {
  const block = await getCreatureById(creatureId);
  if (!block) return null;
  return cloneToHomebrew(block, { campaignId, nameSuffix: '' });
}

/** Apply resolutions: returns remapped creature ids and npc ids to load. */
export async function applyDependencyResolutions(
  resolutions: DepResolution[],
  copyToCampaignId?: string,
): Promise<{
  creatureIdMap: Map<string, string>;
  omitCreatures: Set<string>;
  omitNpcs: Set<string>;
}> {
  const creatureIdMap = new Map<string, string>();
  const omitCreatures = new Set<string>();
  const omitNpcs = new Set<string>();

  for (const r of resolutions) {
    if (r.action === 'omit') {
      if (r.creatureId) omitCreatures.add(r.creatureId);
      if (r.npcId) omitNpcs.add(r.npcId);
      continue;
    }
    if (r.action === 'promote') {
      const promoted = await promoteHomebrewToGlobal(r.creatureId);
      if (promoted) creatureIdMap.set(r.creatureId, promoted.id);
      else omitCreatures.add(r.creatureId);
      continue;
    }
    if (r.action === 'copy') {
      if (!copyToCampaignId) {
        omitCreatures.add(r.creatureId);
        continue;
      }
      const copied = await copyHomebrewToCampaign(r.creatureId, copyToCampaignId);
      if (copied) creatureIdMap.set(r.creatureId, copied.id);
      else omitCreatures.add(r.creatureId);
    }
  }
  return { creatureIdMap, omitCreatures, omitNpcs };
}

export function blankEncounter(system: System, name: string, tags: string[]): SavedEncounter {
  return {
    id: crypto.randomUUID(),
    name,
    system,
    campaignTags: tags,
    entries: [],
    npcIds: [],
    trackerPresets: [],
    loot: [],
    notes: '',
    createdAt: Date.now(),
    timesRun: 0,
  };
}

/** Add or bump a creature entry on a saved encounter (prep shelf builder). */
export function addCreatureEntry(
  encounter: SavedEncounter,
  creature: Pick<StatBlock, 'id' | 'name'>,
  quantity = 1,
): SavedEncounter {
  const qty = Math.max(1, Math.min(24, Math.floor(quantity) || 1));
  const entries = [...encounter.entries];
  const idx = entries.findIndex((e) => e.creatureId === creature.id);
  if (idx >= 0) {
    const cur = entries[idx]!;
    entries[idx] = {
      ...cur,
      quantity: Math.min(24, cur.quantity + qty),
    };
  } else {
    entries.push({
      creatureId: creature.id,
      nameSnapshot: creature.name,
      quantity: qty,
    });
  }
  return { ...encounter, entries };
}

export function setCreatureEntryQuantity(
  encounter: SavedEncounter,
  creatureId: string,
  quantity: number,
): SavedEncounter {
  // Cleared / garbage inputs from number fields arrive as NaN — leave the pack alone.
  if (!Number.isFinite(quantity)) return encounter;
  const qty = Math.floor(quantity);
  if (qty <= 0) {
    return {
      ...encounter,
      entries: encounter.entries.filter((e) => e.creatureId !== creatureId),
    };
  }
  return {
    ...encounter,
    entries: encounter.entries.map((e) =>
      e.creatureId === creatureId
        ? { ...e, quantity: Math.min(24, qty) }
        : e,
    ),
  };
}

export function removeCreatureEntry(
  encounter: SavedEncounter,
  creatureId: string,
): SavedEncounter {
  return {
    ...encounter,
    entries: encounter.entries.filter((e) => e.creatureId !== creatureId),
  };
}

export function encounterFromCombat(opts: {
  name: string;
  system: System;
  campaignTags: string[];
  combatants: {
    name: string;
    kind: string;
    statBlock?: StatBlock;
    sourceNpcId?: string;
    groupKey?: string;
  }[];
  npcs: NpcRecord[];
  trackers: Tracker[];
  notes?: string;
  loot?: import('../types').EncounterLootLine[];
}): SavedEncounter {
  const entryMap = new Map<
    string,
    { creatureId: string; nameSnapshot: string; quantity: number }
  >();
  const npcIds: string[] = [];

  for (const c of opts.combatants) {
    if (c.kind === 'pc' || c.kind === 'lair') continue;
    if (c.sourceNpcId) {
      if (!npcIds.includes(c.sourceNpcId)) npcIds.push(c.sourceNpcId);
      continue;
    }
    const id = c.statBlock?.id;
    if (!id) continue;
    const key = c.groupKey ?? id;
    const existing = entryMap.get(key);
    if (existing) existing.quantity += 1;
    else {
      entryMap.set(key, {
        creatureId: id,
        nameSnapshot: c.statBlock?.name ?? c.name,
        quantity: 1,
      });
    }
  }

  return {
    id: crypto.randomUUID(),
    name: opts.name,
    system: opts.system,
    campaignTags: opts.campaignTags,
    entries: [...entryMap.values()],
    npcIds,
    trackerPresets: opts.trackers
      .filter((t) => t.scope === 'encounter')
      .map(({ id: _id, ...rest }) => rest),
    loot: (opts.loot ?? [])
      .filter((l) => l.text.trim())
      .map(({ awarded: _a, ...rest }) => ({ ...rest, awarded: undefined })),
    notes: opts.notes ?? '',
    createdAt: Date.now(),
    timesRun: 0,
  };
}

export function systemGateReason(
  encounter: SavedEncounter,
  campaignSystem: System,
): string | null {
  if (encounter.system === campaignSystem) return null;
  return `Built for ${encounter.system === 'pf2e' ? 'Pathfinder 2e' : 'D&D 5e'} — cannot load into a ${
    campaignSystem === 'pf2e' ? 'PF2e' : '5e'
  } campaign (no conversion)`;
}
