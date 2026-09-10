import { describe, expect, it, vi } from 'vitest';
import { bestiaryDb } from './db';
import { searchCreatures } from './search';
import type { StatBlock } from '../../types';

function creature(name: string, i: number): StatBlock {
  const slug = `c-${i}`;
  return {
    id: `dnd5e:test:${slug}`, system: 'dnd5e', origin: 'synced', slug,
    source: 'Test', size: 'Medium', type: 'humanoid', alignment: '',
    ac: 12, hpAvg: 10, hitDice: '2d8', speed: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {}, skills: {}, resistances: '', immunities: '', senses: '',
    languages: '', cr: '1', traits: [],
    actions: [{ name: 'Slam', desc: 'Melee Weapon Attack: +5 to hit. Hit: 2d6+3 bludgeoning damage. '.repeat(6) }],
    bonusActions: [], reactions: [], legendaryActions: [],
    name,
  } as StatBlock;
}

/**
 * Guards the property the fast path depends on: a single-token name query must
 * bind to the [system+nameLower] index and never read the whole table. Measured
 * on 3000 creatures with realistic action text, the difference is 28.7ms of
 * IndexedDB deserialisation per keystroke versus 2.1ms.
 */
describe('search index engagement', () => {
  it('reads a page, not the table, for a single-token name query', async () => {
    await bestiaryDb.creatures.clear();
    const rows: StatBlock[] = [];
    for (let i = 0; i < 3000; i++) {
      rows.push(creature(i % 3 === 0 ? `Goblin ${i}` : `Beast ${i}`, i));
    }
    await bestiaryDb.creatures.bulkPut(rows);

    const spy = vi.spyOn(bestiaryDb.creatures, 'where');
    const found = await searchCreatures({ system: 'dnd5e', query: 'goblin', limit: 40 });
    const indexesUsed = spy.mock.calls.map((c) => c[0]);
    spy.mockRestore();

    expect(found).toHaveLength(40);
    expect(indexesUsed).toContain('[system+nameLower]');
    // The giveaway: the fallback binds to plain 'system' and reads everything.
    expect(indexesUsed).not.toContain('system');
  });

  it('is fast enough to run per keystroke on a full catalog', async () => {
    const t0 = performance.now();
    for (const q of ['g', 'go', 'gob', 'gobl', 'gobli', 'goblin']) {
      await searchCreatures({ system: 'dnd5e', query: q, limit: 40 });
    }
    const perKeystroke = (performance.now() - t0) / 6;
    console.log(`  per-keystroke: ${perKeystroke.toFixed(1)}ms over 3000 creatures`);
    expect(perKeystroke).toBeLessThan(60);
  });
});
