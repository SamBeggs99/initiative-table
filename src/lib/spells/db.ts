import Dexie, { type Table } from 'dexie';
import type { Spell, System } from '../../types';

export type SpellRecord = Spell;

export interface SpellMeta {
  key: string;
  lastSyncedAt?: number;
  lastSyncedCount?: number;
  retiredCount?: number;
}

export class SpellDB extends Dexie {
  spells!: Table<SpellRecord, string>;
  spellsStaging!: Table<SpellRecord, string>;
  meta!: Table<SpellMeta, string>;

  constructor() {
    super('initiative-table-spells');
    this.version(1).stores({
      spells:
        'id, [system+origin], [system+campaignId], name, level, school, source, slug, system, origin, campaignId',
      spellsStaging: 'id, system, origin, slug',
      meta: 'key',
    });
  }
}

export const spellDb = new SpellDB();

export function spellMetaKey(system: System): string {
  return `spell-sync:${system}`;
}
