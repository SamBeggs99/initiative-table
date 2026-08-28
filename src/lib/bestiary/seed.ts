import srdMonsters from '../../data/srd-monsters.json' with { type: 'json' };
import { enrichEntry } from '../parse';
import type { StatBlock } from '../../types';
import { bestiaryDb } from './db';

/** Bundled JSON predates structured fields — fill from Hit: / Requirements lines. */
function withStructuredActions(m: StatBlock): StatBlock {
  return {
    ...m,
    actions: m.actions.map(enrichEntry),
    bonusActions: m.bonusActions.map(enrichEntry),
    reactions: m.reactions.map(enrichEntry),
    legendaryActions: m.legendaryActions.map(enrichEntry),
  };
}

const BUNDLED = (srdMonsters as unknown as StatBlock[]).map(withStructuredActions);

/** Seed bundled SRD monsters once. Never overwrites synced or homebrew. */
export async function ensureBundledSeeded(): Promise<number> {
  const already = await bestiaryDb.creatures
    .where('[system+origin]')
    .equals(['dnd5e', 'bundled'])
    .count();
  // Skip the per-row rewrite when the SRD is already in Dexie. Re-walking
  // every bundled row against a 4k-creature table blocked the PF2e library.
  if (already >= BUNDLED.length) return 0;

  let written = 0;
  await bestiaryDb.transaction('rw', bestiaryDb.creatures, async () => {
    for (const monster of BUNDLED) {
      const existing = await bestiaryDb.creatures.get(monster.id);
      if (existing) {
        if (existing.origin === 'bundled') {
          await bestiaryDb.creatures.put({
            ...monster,
            origin: 'bundled',
            retired: false,
            portraitDataUrl: existing.portraitDataUrl,
          });
        }
        continue;
      }
      await bestiaryDb.creatures.put({ ...monster, origin: 'bundled', retired: false });
      written += 1;
    }
  });
  return written;
}

export function getBundledCount(): number {
  return BUNDLED.length;
}
