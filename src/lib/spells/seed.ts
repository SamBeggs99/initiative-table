import fivee from '../../data/srd-spells-5e.json' with { type: 'json' };
import pf2e from '../../data/srd-spells-pf2e.json' with { type: 'json' };
import type { Spell } from '../../types';
import { spellDb } from './db';

const BUNDLED = [
  ...(fivee as unknown as Spell[]),
  ...(pf2e as unknown as Spell[]),
];

/** Seed bundled SRD spells once. Never overwrites synced or homebrew. */
export async function ensureSpellsSeeded(): Promise<number> {
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
  return BUNDLED.length;
}
