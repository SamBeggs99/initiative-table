import type { Spell, StatBlock } from '../../types';
import { bestiaryDb } from '../bestiary/db';
import { spellDb } from '../spells/db';

export async function readHomebrewCreatures(): Promise<StatBlock[]> {
  return bestiaryDb.creatures.where('origin').equals('homebrew').toArray();
}

export async function readHomebrewSpells(): Promise<Spell[]> {
  return spellDb.spells.where('origin').equals('homebrew').toArray();
}

export async function replaceHomebrewCreatures(rows: StatBlock[]): Promise<void> {
  const existing = await bestiaryDb.creatures
    .where('origin')
    .equals('homebrew')
    .toArray();
  await bestiaryDb.transaction('rw', bestiaryDb.creatures, async () => {
    for (const row of existing) {
      await bestiaryDb.creatures.delete(row.id);
    }
    if (rows.length > 0) await bestiaryDb.creatures.bulkPut(rows);
  });
}

export async function replaceHomebrewSpells(rows: Spell[]): Promise<void> {
  const existing = await spellDb.spells.where('origin').equals('homebrew').toArray();
  await spellDb.transaction('rw', spellDb.spells, async () => {
    for (const row of existing) {
      await spellDb.spells.delete(row.id);
    }
    if (rows.length > 0) await spellDb.spells.bulkPut(rows);
  });
}
