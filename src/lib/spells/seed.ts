import type { Spell } from '../../types';
import { spellDb } from './db';

/** Bundled SRD spell count (50 × 5e + 33 × PF2e), so the check needs no parse. */
const BUNDLED_COUNT = 83;

/**
 * Loaded on demand rather than as a static import, so the bundled SRD JSON is
 * its own chunk and a boot with a seeded database never fetches or parses it.
 */
async function loadBundled(): Promise<Spell[]> {
  const [fivee, pf2e] = await Promise.all([
    import('../../data/srd-spells-5e.json'),
    import('../../data/srd-spells-pf2e.json'),
  ]);
  const unwrap = (mod: unknown) =>
    (((mod as { default?: unknown }).default ?? mod) as Spell[]) ?? [];
  return [...unwrap(fivee), ...unwrap(pf2e)];
}

/** Seed bundled SRD spells once. Never overwrites synced or homebrew. */
export async function ensureSpellsSeeded(): Promise<number> {
  const already = await spellDb.spells
    .where('origin')
    .equals('bundled')
    .count();
  if (already >= BUNDLED_COUNT) return 0;

  const BUNDLED = await loadBundled();
  let written = 0;
  await spellDb.transaction('rw', spellDb.spells, async () => {
    for (const spell of BUNDLED) {
      const existing = await spellDb.spells.get(spell.id);
      if (existing) {
        if (existing.origin === 'bundled') {
          await spellDb.spells.put({ ...spell, origin: 'bundled', retired: false });
        }
        continue;
      }
      await spellDb.spells.put({ ...spell, origin: 'bundled', retired: false });
      written += 1;
    }
  });
  return written;
}

export function getBundledSpellCount(): number {
  return BUNDLED_COUNT;
}
