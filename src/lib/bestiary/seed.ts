import { enrichEntry } from '../parse';
import type { StatBlock } from '../../types';
import { bestiaryDb } from './db';

/** Bundled SRD count, hard-coded so the seed check needs no JSON parse. */
const BUNDLED_COUNT = 25;

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

/**
 * Loaded on demand. This used to be a module-level const over a static JSON
 * import, so every boot parsed the SRD and ran `enrichEntry` across every
 * action — for the ~99% of boots where Dexie is already seeded and nothing is
 * written. Now the JSON is a separate chunk that is only fetched on a genuinely
 * first run.
 */
async function loadBundled(): Promise<StatBlock[]> {
  const mod = await import('../../data/srd-monsters.json');
  const rows = ((mod as { default?: unknown }).default ?? mod) as StatBlock[];
  return rows.map(withStructuredActions);
}

/** Seed bundled SRD monsters once. Never overwrites synced or homebrew. */
export async function ensureBundledSeeded(): Promise<number> {
  const already = await bestiaryDb.creatures
    .where('[system+origin]')
    .equals(['dnd5e', 'bundled'])
    .count();
  // Skip the per-row rewrite when the SRD is already in Dexie. Re-walking
  // every bundled row against a 4k-creature table blocked the PF2e library.
  if (already >= BUNDLED_COUNT) return 0;

  const BUNDLED = await loadBundled();

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
  return BUNDLED_COUNT;
}
