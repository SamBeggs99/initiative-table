import { newHomebrewId, slugifyName } from './bestiary/ids';
import { notifyCloudDirty } from './cloud/dirty';
import { spellDb } from './spells/db';
import type { Spell } from '../types';

export { spellDb } from './spells/db';
export { ensureSpellsSeeded, getBundledSpellCount } from './spells/seed';
export {
  getSpellById,
  getSpellsByIds,
  getSpellStats,
  SpellSyncAbortedError,
} from './spells/sync';
export { syncNethysSpells, fetchNethysCoreSpells } from './spells/sync-nethys';
export {
  syncDnd5eApiSpells,
  fetchDnd5eApiSpells,
} from './spells/sync-dnd5eapi';
export type { SpellSyncProgress } from './spells/sync';
export { searchSpells, spellBadge } from './spells/search';
export type { SpellSearchResult, SearchSpellsQuery } from './spells/search';
export { open5eToSpell } from './spells/normalize-open5e';
export { dnd5eApiToSpell } from './spells/normalize-dnd5eapi';
export { nethysToSpell, NETHYS_CORE_SOURCES } from './spells/normalize-nethys';

export function spellLevelLabel(spell: Spell): string {
  const cantrip =
    spell.level === 0 || Boolean(spell.pf2e?.traits.includes('cantrip'));
  if (spell.system === 'pf2e') {
    if (cantrip) return 'Cantrip';
    return `Rank ${spell.level}`;
  }
  if (cantrip) return 'Cantrip';
  const n = spell.level;
  const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suf}-level`;
}

export function blankSpell(
  system: Spell['system'],
  opts?: { campaignId?: string; name?: string },
): Spell {
  const now = Date.now();
  const name = opts?.name?.trim() || 'New spell';
  return {
    id: newHomebrewId(),
    system,
    origin: 'homebrew',
    campaignId: opts?.campaignId,
    slug: slugifyName(name),
    name,
    level: 1,
    school: 'evocation',
    castingTime: system === 'pf2e' ? '2 actions' : '1 action',
    range: system === 'pf2e' ? '30 feet' : '60 feet',
    components: system === 'pf2e' ? '' : 'V, S',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    classes: [],
    desc: '',
    source: 'Homebrew',
    pf2e:
      system === 'pf2e'
        ? {
            traditions: ['arcane'],
            traits: ['concentrate', 'manipulate'],
            actions: 2,
          }
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveHomebrewSpell(
  partial: Omit<Spell, 'origin'> & { id?: string; origin?: Spell['origin'] },
): Promise<Spell> {
  const now = Date.now();
  const record: Spell = {
    ...partial,
    id: partial.id ?? newHomebrewId(),
    origin: 'homebrew',
    slug: partial.slug || slugifyName(partial.name),
    source: 'Homebrew',
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  };
  await spellDb.spells.put(record);
  notifyCloudDirty();
  return record;
}

export async function deleteHomebrewSpell(id: string): Promise<boolean> {
  const existing = await spellDb.spells.get(id);
  if (!existing || existing.origin !== 'homebrew') return false;
  await spellDb.spells.delete(id);
  notifyCloudDirty();
  return true;
}
