import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatBlock } from '../types';
import {
  bestiaryDb,
  buildCombatantsFromStatBlock,
  ensureBundledSeeded,
  getCreatureById,
  saveHomebrewCreature,
  searchCreatures,
  syncOpen5eBestiary,
} from './bestiary';
import { open5eToStatBlock } from './bestiary/normalize-open5e';

function homebrewGoblin(overrides: Partial<StatBlock> = {}): StatBlock {
  return {
    id: crypto.randomUUID(),
    system: 'dnd5e',
    origin: 'homebrew',
    campaignId: 'camp-1',
    slug: 'grix-dock-boss',
    name: 'Grix, dock boss',
    size: 'Small',
    type: 'humanoid',
    alignment: 'neutral evil',
    ac: 16,
    hpAvg: 22,
    hitDice: '4d6+4',
    speed: { walk: 30 },
    abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 8, cha: 10 },
    saves: {},
    skills: { Stealth: 7 },
    senses: 'darkvision 60 ft.',
    languages: 'Common, Goblin',
    cr: '1',
    traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }],
    actions: [{ name: 'Scimitar', desc: '+5 to hit. Hit: 6 (1d6+3) slashing.' }],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    source: 'Homebrew',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mockOpen5ePage(monsters: ReturnType<typeof open5eToStatBlock>[], next: string | null = null) {
  // Return Open5e-shaped raw by reverse... easier to build raw fixtures
  return {
    count: monsters.length,
    next,
    results: monsters.map((m) => ({
      slug: m.slug,
      name: m.name,
      size: m.size,
      type: m.type,
      alignment: m.alignment,
      armor_class: m.ac,
      armor_desc: m.acDesc,
      hit_points: m.hpAvg,
      hit_dice: m.hitDice,
      speed: m.speed,
      strength: m.abilities.str,
      dexterity: m.abilities.dex,
      constitution: m.abilities.con,
      intelligence: m.abilities.int,
      wisdom: m.abilities.wis,
      charisma: m.abilities.cha,
      skills: m.skills,
      senses: m.senses,
      languages: m.languages,
      challenge_rating: m.cr,
      actions: m.actions,
      special_abilities: m.traits,
      legendary_actions: m.legendaryActions,
      legendary_desc: m.legendaryDesc,
      document__slug: m.id.split(':')[1],
      document__title: m.source,
    })),
  };
}

beforeEach(async () => {
  await bestiaryDb.creatures.clear();
  await bestiaryDb.creaturesStaging.clear();
  await bestiaryDb.meta.clear();
});

describe('bestiary sync homebrew safety', () => {
  it('seeds homebrew, runs a sync, and keeps homebrew byte-identical', async () => {
    const hb = homebrewGoblin();
    await bestiaryDb.creatures.put(hb);
    const before = structuredClone(await bestiaryDb.creatures.get(hb.id));

    const synced = open5eToStatBlock({
      slug: 'goblin',
      name: 'Goblin',
      size: 'Small',
      type: 'Humanoid',
      armor_class: 15,
      hit_points: 7,
      hit_dice: '2d6',
      speed: { walk: 30 },
      strength: 8,
      dexterity: 14,
      constitution: 10,
      intelligence: 10,
      wisdom: 8,
      charisma: 8,
      challenge_rating: '1/4',
      document__slug: 'wotc-srd',
      document__title: 'SRD',
      actions: [],
      special_abilities: [],
    });

    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => mockOpen5ePage([synced]),
      } as Response;
    });

    await syncOpen5eBestiary(undefined, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const after = await bestiaryDb.creatures.get(hb.id);
    expect(after).toEqual(before);

    const allHomebrew = await bestiaryDb.creatures.where('origin').equals('homebrew').toArray();
    expect(allHomebrew).toHaveLength(1);
    expect(allHomebrew[0]).toEqual(before);

    const goblin = await getCreatureById(synced.id);
    expect(goblin?.origin).toBe('synced');
    expect(goblin?.id).toBe('dnd5e:wotc-srd:goblin');
  });

  it('retires missing synced creatures instead of hard-deleting', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      open5eToStatBlock({
        slug: `m${i}`,
        name: `Monster ${i}`,
        challenge_rating: '1',
        document__slug: 'wotc-srd',
        document__title: 'SRD',
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        hit_points: 10,
        armor_class: 10,
      }),
    );

    await syncOpen5eBestiary(undefined, {
      fetchImpl: async () =>
        ({ ok: true, json: async () => mockOpen5ePage(many) }) as Response,
    });

    // Drop one creature (10% — under the 20% abort threshold)
    await syncOpen5eBestiary(undefined, {
      fetchImpl: async () =>
        ({ ok: true, json: async () => mockOpen5ePage(many.slice(0, 9)) }) as Response,
    });

    const missing = await getCreatureById(many[9]!.id);
    expect(missing?.retired).toBe(true);
    expect(await bestiaryDb.creatures.get(many[9]!.id)).toBeTruthy();

    const results = await searchCreatures({ system: 'dnd5e', query: 'Monster 9' });
    expect(results).toHaveLength(0);
  });

  it('aborts if count drops more than 20% and leaves prior synced intact', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      open5eToStatBlock({
        slug: `m${i}`,
        name: `Monster ${i}`,
        challenge_rating: '1',
        document__slug: 'wotc-srd',
        document__title: 'SRD',
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        hit_points: 10,
        armor_class: 10,
      }),
    );

    await syncOpen5eBestiary(undefined, {
      fetchImpl: async () =>
        ({ ok: true, json: async () => mockOpen5ePage(many) }) as Response,
    });

    await expect(
      syncOpen5eBestiary(undefined, {
        fetchImpl: async () =>
          ({ ok: true, json: async () => mockOpen5ePage(many.slice(0, 5)) }) as Response,
      }),
    ).rejects.toThrow(/20%/);

    const still = await bestiaryDb.creatures.where('origin').equals('synced').count();
    expect(still).toBe(10);
  });
});

describe('searchCreatures', () => {
  it('never returns the other system', async () => {
    await saveHomebrewCreature({
      ...homebrewGoblin({ id: undefined, system: 'pf2e', name: 'Goblin PF', slug: 'goblin-pf' }),
      system: 'pf2e',
    });
    await ensureBundledSeeded();
    const results = await searchCreatures({ system: 'dnd5e', query: 'Goblin' });
    expect(results.every((r) => r.creature.system === 'dnd5e')).toBe(true);
  });

  it('includes campaign homebrew and global homebrew, not other campaigns', async () => {
    await saveHomebrewCreature(homebrewGoblin({ campaignId: 'camp-1', name: 'Mine' }));
    await saveHomebrewCreature(
      homebrewGoblin({
        id: crypto.randomUUID(),
        campaignId: 'camp-2',
        name: 'Other',
        slug: 'other',
      }),
    );
    await saveHomebrewCreature(
      homebrewGoblin({
        id: crypto.randomUUID(),
        campaignId: undefined,
        name: 'Global Boss',
        slug: 'global-boss',
      }),
    );

    const results = await searchCreatures({ system: 'dnd5e', campaignId: 'camp-1' });
    const names = results.map((r) => r.creature.name);
    expect(names).toContain('Mine');
    expect(names).toContain('Global Boss');
    expect(names).not.toContain('Other');
  });

  it('finds by trait/action free text and badges provenance', async () => {
    await ensureBundledSeeded();
    const results = await searchCreatures({
      system: 'dnd5e',
      campaignId: 'camp-1',
      query: 'pack tactics',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => /kobold/i.test(r.creature.name))).toBe(true);
    expect(results.every((r) => r.badge === 'SRD')).toBe(true);
  });
});

describe('buildCombatantsFromStatBlock', () => {
  it('embeds a copy, suffixes names, shares groupKey, hydrates legendary resistance', async () => {
    await ensureBundledSeeded();
    const found = await searchCreatures({ system: 'dnd5e', query: 'adult red dragon' });
    const block = found[0]!.creature;
    const combatants = buildCombatantsFromStatBlock(block, {
      quantity: 2,
      hpMode: 'average',
    });
    expect(combatants).toHaveLength(2);
    expect(combatants[0]!.name).toMatch(/A$/);
    expect(combatants[1]!.name).toMatch(/B$/);
    expect(combatants[0]!.groupKey).toBe(combatants[1]!.groupKey);
    expect(combatants[0]!.initiative).toBeNull();
    expect(combatants[1]!.initiative).toBeNull();
    expect(combatants[0]!.legendaryResistance.max).toBe(3);
    expect(combatants[0]!.legendaryActions.max).toBeGreaterThanOrEqual(3);
    // Embedded copy — mutating bestiary later must not affect combatant
    combatants[0]!.statBlock!.name = 'MUTATED';
    const again = await getCreatureById(block.id);
    expect(again?.name).not.toBe('MUTATED');
  });
});
