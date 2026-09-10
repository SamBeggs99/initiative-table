import { beforeEach, describe, expect, it } from 'vitest';
import { bestiaryDb, creatureSearchFields } from './db';
import { searchCreatures } from './search';
import type { StatBlock } from '../../types';

/**
 * The search has two tiers: an indexed name-prefix page, and a full scan. The
 * fast tier is only allowed to answer when it provably holds the top of the
 * ranking, so the contract these tests defend is that the tiers never disagree.
 */

function creature(patch: Partial<StatBlock> & { name: string }): StatBlock {
  const slug = patch.slug ?? patch.name.toLowerCase().replace(/\s+/g, '-');
  return {
    id: patch.id ?? `dnd5e:test:${slug}`,
    system: 'dnd5e',
    origin: 'synced',
    slug,
    source: 'Test Compendium',
    size: 'Medium',
    type: 'humanoid',
    alignment: 'neutral',
    ac: 12,
    hpAvg: 10,
    hitDice: '2d8',
    speed: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {},
    skills: {},
    resistances: '',
    immunities: '',
    senses: '',
    languages: '',
    cr: '1',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    ...patch,
  } as StatBlock;
}

async function seed(rows: StatBlock[]) {
  await bestiaryDb.creatures.clear();
  await bestiaryDb.creatures.bulkPut(rows);
}

const names = (rs: { creature: StatBlock }[]) => rs.map((r) => r.creature.name);

beforeEach(async () => {
  await bestiaryDb.creatures.clear();
});

describe('search index fields', () => {
  it('writes nameLower and searchText on every insert path', async () => {
    await seed([creature({ name: 'Adult Red Dragon' })]);
    const row = await bestiaryDb.creatures.get('dnd5e:test:adult-red-dragon');
    expect(row?.nameLower).toBe('adult red dragon');
    expect(row?.searchText).toContain('adult red dragon');
  });

  it('refreshes them when a row is updated', async () => {
    await seed([creature({ name: 'Goblin' })]);
    await bestiaryDb.creatures.update('dnd5e:test:goblin', {
      name: 'Goblin Boss',
    });
    const row = await bestiaryDb.creatures.get('dnd5e:test:goblin');
    expect(row?.nameLower).toBe('goblin boss');
  });

  it('folds trait and action text into searchText', async () => {
    await seed([
      creature({
        name: 'Wraith',
        actions: [{ name: 'Life Drain', desc: 'necrotic damage on a hit' }],
      }),
    ]);
    const row = await bestiaryDb.creatures.get('dnd5e:test:wraith');
    expect(row?.searchText).toContain('life drain');
    expect(row?.searchText).toContain('necrotic');
  });

  it('derives the same fields the search would compute on the fly', () => {
    const c = creature({ name: 'Ogre', type: 'giant' });
    const f = creatureSearchFields(c);
    expect(f.nameLower).toBe('ogre');
    expect(f.searchText).toContain('giant');
  });
});

describe('the two tiers agree', () => {
  // Enough same-prefix rows to fill a page and trigger the indexed tier.
  const many = Array.from({ length: 12 }, (_, i) =>
    creature({ name: `Goblin ${String(i).padStart(2, '0')}` }),
  );

  it('returns the same page whether or not the fast path engages', async () => {
    await seed([...many, creature({ name: 'Hobgoblin' })]);

    // limit 5 fills from the prefix index; limit 50 cannot, so it scans.
    const fast = await searchCreatures({ system: 'dnd5e', query: 'goblin', limit: 5 });
    const scanned = await searchCreatures({
      system: 'dnd5e',
      query: 'goblin',
      limit: 50,
    });

    expect(fast).toHaveLength(5);
    expect(names(fast)).toEqual(names(scanned).slice(0, 5));
  });

  it('still finds mid-word matches the prefix index cannot see', async () => {
    await seed([...many, creature({ name: 'Hobgoblin' })]);
    const all = await searchCreatures({
      system: 'dnd5e',
      query: 'goblin',
      limit: 50,
    });
    expect(names(all)).toContain('Hobgoblin');
    // Prefix matches outrank the substring match, so it lands last.
    expect(names(all).at(-1)).toBe('Hobgoblin');
  });

  it('falls through when filters thin the prefix page', async () => {
    await seed([
      ...many,
      creature({ name: 'Goblin Chief', origin: 'homebrew', campaignId: 'camp-1' }),
    ]);
    // origin filter removes every synced row, so the prefix page cannot answer.
    const homebrewOnly = await searchCreatures({
      system: 'dnd5e',
      query: 'goblin',
      origin: 'homebrew',
      campaignId: 'camp-1',
      limit: 5,
    });
    expect(names(homebrewOnly)).toEqual(['Goblin Chief']);
  });

  it('applies the CR filter on both paths', async () => {
    await seed(
      Array.from({ length: 12 }, (_, i) =>
        creature({ name: `Goblin ${i}`, cr: i < 6 ? '1/4' : '5' }),
      ),
    );
    const low = await searchCreatures({
      system: 'dnd5e',
      query: 'goblin',
      crRange: { max: 1 },
      limit: 50,
    });
    expect(low).toHaveLength(6);
    expect(low.every((r) => r.creature.cr === '1/4')).toBe(true);
  });
});

describe('ranking and visibility are unchanged', () => {
  it('ranks exact name above prefix above substring above body text', async () => {
    await seed([
      creature({ name: 'Ogre' }),
      creature({ name: 'Ogre Chieftain' }),
      creature({ name: 'Half-Ogre' }),
      creature({
        name: 'Zealot',
        actions: [{ name: 'Smash', desc: 'as an ogre would' }],
      }),
    ]);
    const found = await searchCreatures({ system: 'dnd5e', query: 'ogre', limit: 50 });
    expect(names(found)).toEqual(['Ogre', 'Ogre Chieftain', 'Half-Ogre', 'Zealot']);
  });

  it('prefers homebrew over synced at the same score', async () => {
    await seed([
      creature({ name: 'Ogre', id: 'a', slug: 'ogre-a' }),
      creature({ name: 'Ogre', id: 'b', slug: 'ogre-b', origin: 'homebrew' }),
    ]);
    const found = await searchCreatures({ system: 'dnd5e', query: 'ogre', limit: 50 });
    expect(found[0]?.creature.id).toBe('b');
  });

  it('never crosses systems', async () => {
    await seed([
      creature({ name: 'Ogre' }),
      creature({ name: 'Ogre', id: 'pf', slug: 'ogre-pf', system: 'pf2e' }),
    ]);
    const found = await searchCreatures({ system: 'pf2e', query: 'ogre', limit: 50 });
    expect(found).toHaveLength(1);
    expect(found[0]?.creature.system).toBe('pf2e');
  });

  it('hides retired synced rows', async () => {
    await seed([creature({ name: 'Ogre', retired: true })]);
    const found = await searchCreatures({ system: 'dnd5e', query: 'ogre', limit: 50 });
    expect(found).toHaveLength(0);
  });

  it('supersedes a bundled row with a synced row of the same slug', async () => {
    await seed([
      creature({ name: 'Ogre', id: 'bundled', origin: 'bundled', slug: 'ogre' }),
      creature({ name: 'Ogre', id: 'synced', origin: 'synced', slug: 'ogre' }),
    ]);
    const found = await searchCreatures({ system: 'dnd5e', query: 'ogre', limit: 50 });
    expect(found).toHaveLength(1);
    expect(found[0]?.creature.id).toBe('synced');
  });

  it('hides another campaign’s homebrew', async () => {
    await seed([
      creature({ name: 'Ogre', origin: 'homebrew', campaignId: 'other' }),
    ]);
    const found = await searchCreatures({
      system: 'dnd5e',
      query: 'ogre',
      campaignId: 'mine',
      limit: 50,
    });
    expect(found).toHaveLength(0);
  });

  it('caps an empty query at the limit', async () => {
    await seed(
      Array.from({ length: 60 }, (_, i) => creature({ name: `Beast ${i}` })),
    );
    const found = await searchCreatures({ system: 'dnd5e', limit: 40 });
    expect(found).toHaveLength(40);
  });
});
