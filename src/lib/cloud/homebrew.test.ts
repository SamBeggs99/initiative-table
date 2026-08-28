import { beforeEach, describe, expect, it } from 'vitest';
import type { Spell, StatBlock } from '../../types';
import { bestiaryDb } from '../bestiary/db';
import { spellDb } from '../spells/db';
import {
  readHomebrewCreatures,
  readHomebrewSpells,
  replaceHomebrewCreatures,
  replaceHomebrewSpells,
} from './homebrew';

function homebrewCreature(id: string, name: string): StatBlock {
  return {
    id,
    system: 'dnd5e',
    origin: 'homebrew',
    slug: name.toLowerCase(),
    name,
    size: 'Medium',
    type: 'humanoid',
    alignment: 'neutral',
    ac: 10,
    hpAvg: 10,
    hitDice: '2d8',
    speed: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {},
    skills: {},
    senses: '',
    languages: 'Common',
    cr: '0',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    source: 'Homebrew',
    createdAt: 1,
    updatedAt: 1,
  };
}

function bundledCreature(): StatBlock {
  return { ...homebrewCreature('bundled-gob', 'Goblin'), origin: 'bundled', id: 'bundled-gob' };
}

function homebrewSpell(id: string, name: string): Spell {
  return {
    id,
    system: 'dnd5e',
    origin: 'homebrew',
    slug: name.toLowerCase(),
    name,
    level: 1,
    school: 'evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    classes: [],
    desc: '',
    source: 'Homebrew',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('cloud homebrew replace', () => {
  beforeEach(async () => {
    await bestiaryDb.creatures.clear();
    await spellDb.spells.clear();
  });

  it('replaces homebrew creatures without touching bundled rows', async () => {
    await bestiaryDb.creatures.bulkPut([
      bundledCreature(),
      homebrewCreature('old-hb', 'Old'),
    ]);
    await replaceHomebrewCreatures([homebrewCreature('new-hb', 'New')]);

    const names = (await readHomebrewCreatures()).map((c) => c.name).sort();
    expect(names).toEqual(['New']);
    expect(await bestiaryDb.creatures.get('bundled-gob')).toBeTruthy();
    expect(await bestiaryDb.creatures.get('old-hb')).toBeUndefined();
  });

  it('replaces homebrew spells', async () => {
    await spellDb.spells.put(homebrewSpell('old-sp', 'Zap'));
    await replaceHomebrewSpells([homebrewSpell('new-sp', 'Boom')]);
    const names = (await readHomebrewSpells()).map((s) => s.name);
    expect(names).toEqual(['Boom']);
  });
});
