import Dexie, { type Table } from 'dexie';
import type { StatBlock, System } from '../../types';

export type CreatureRecord = StatBlock;

export interface BestiaryMeta {
  key: string;
  lastSyncedAt?: number;
  lastSyncedCount?: number;
  retiredCount?: number;
}

export class BestiaryDB extends Dexie {
  creatures!: Table<CreatureRecord, string>;
  creaturesStaging!: Table<CreatureRecord, string>;
  meta!: Table<BestiaryMeta, string>;

  constructor() {
    super('initiative-table-bestiary');
    this.version(1).stores({
      creatures:
        'id, [system+origin], [system+campaignId], name, cr, source, slug, system, origin, campaignId',
      creaturesStaging: 'id, system, origin, slug',
      meta: 'key',
    });
  }
}

export const bestiaryDb = new BestiaryDB();

export function metaKey(system: System): string {
  return `sync:${system}`;
}
