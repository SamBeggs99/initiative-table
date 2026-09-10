import Dexie, { type Table } from 'dexie';
import type { StatBlock, System } from '../../types';

/**
 * Storage-only search fields, derived from the stat block on write. They are
 * deliberately not part of `StatBlock` in types.ts — that stays the domain
 * model; this is an index.
 */
export interface CreatureSearchFields {
  /** Lowercased name, indexed for prefix search. */
  nameLower?: string;
  /**
   * Everything a text query can match, lowercased and flattened once at write
   * time, rather than rebuilt per row per keystroke as `haystack()` used to do.
   * The bigger win is `nameLower`: the dominant cost was never the string
   * building but reading every full stat block out of IndexedDB to score it.
   * Measured on 3000 creatures, a single-token query went from 28.7ms to 2.1ms.
   */
  searchText?: string;
}

export type CreatureRecord = StatBlock & CreatureSearchFields;

export interface BestiaryMeta {
  key: string;
  lastSyncedAt?: number;
  lastSyncedCount?: number;
  retiredCount?: number;
}

function entryText(list: StatBlock['traits'] | undefined): string {
  return (list ?? []).map((t) => `${t.name} ${t.desc}`).join(' ');
}

/** Derive the index fields. Must match what `search.ts` expects to query. */
export function creatureSearchFields(c: StatBlock): CreatureSearchFields {
  return {
    nameLower: (c.name ?? '').toLowerCase(),
    searchText: [
      c.name,
      c.type,
      c.cr,
      c.source,
      entryText(c.traits),
      entryText(c.actions),
      entryText(c.bonusActions),
      entryText(c.reactions),
      entryText(c.legendaryActions),
    ]
      .join(' ')
      .toLowerCase(),
  };
}

/**
 * A stored portrait, keyed by a hash of its own bytes.
 *
 * Content addressing is load-bearing rather than tidy: eight goblins pulled
 * from one bestiary row used to embed eight base64 copies of the same image in
 * localStorage. Keyed by content, they converge on one row here.
 */
export interface PortraitRecord {
  /** `sha256-<hex>` of the encoded bytes. */
  id: string;
  blob: Blob;
  bytes: number;
  at: number;
}

export class BestiaryDB extends Dexie {
  creatures!: Table<CreatureRecord, string>;
  creaturesStaging!: Table<CreatureRecord, string>;
  portraits!: Table<PortraitRecord, string>;
  meta!: Table<BestiaryMeta, string>;

  constructor() {
    super('initiative-table-bestiary');
    this.version(1).stores({
      creatures:
        'id, [system+origin], [system+campaignId], name, cr, source, slug, system, origin, campaignId',
      creaturesStaging: 'id, system, origin, slug',
      meta: 'key',
    });
    // v2 adds the search index. `[system+nameLower]` is the compound the
    // creature search binds its prefix tier to.
    this.version(2)
      .stores({
        creatures:
          'id, [system+origin], [system+campaignId], [system+nameLower], name, nameLower, cr, source, slug, system, origin, campaignId',
        creaturesStaging: 'id, system, origin, slug',
        meta: 'key',
      })
      .upgrade((tx) =>
        tx
          .table<CreatureRecord>('creatures')
          .toCollection()
          .modify((row) => {
            Object.assign(row, creatureSearchFields(row));
          }),
      );
    // v3 adds the portrait blob store. Portraits used to be base64 data URLs
    // inside campaign state, i.e. inside the ~5 MB localStorage budget, at
    // roughly 320 kB of quota per image once base64 and UTF-16 were counted.
    this.version(3).stores({
      creatures:
        'id, [system+origin], [system+campaignId], [system+nameLower], name, nameLower, cr, source, slug, system, origin, campaignId',
      creaturesStaging: 'id, system, origin, slug',
      portraits: 'id, at',
      meta: 'key',
    });

    /*
     * Hooks rather than a wrapper on every call site: creatures are written by
     * seed, both syncs, staging promotion, homebrew save, portrait upload and
     * cloud restore. A single choke point here cannot be forgotten by the next
     * write path someone adds.
     */
    this.creatures.hook('creating', (_primKey, obj) => {
      Object.assign(obj, creatureSearchFields(obj));
    });
    this.creatures.hook('updating', (mods, _primKey, obj) => {
      const next = { ...obj, ...(mods as Partial<CreatureRecord>) };
      return creatureSearchFields(next);
    });
  }
}

export const bestiaryDb = new BestiaryDB();

export function metaKey(system: System): string {
  return `sync:${system}`;
}
