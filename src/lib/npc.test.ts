import { describe, expect, it } from 'vitest';
import {
  applyNpcHpWriteBack,
  blankCharacterNpc,
  importNpcJson,
  npcFromPaste,
  npcFromStatBlock,
  searchNpcs,
  statNpc,
  woundedLabel,
} from './npc';
import type { NpcRecord, StatBlock } from '../types';

function stubBlock(name: string): StatBlock {
  return {
    id: 'b1',
    system: 'dnd5e',
    origin: 'bundled',
    slug: name.toLowerCase(),
    name,
    size: 'Small',
    type: 'humanoid',
    alignment: 'neutral evil',
    ac: 15,
    hpAvg: 7,
    hitDice: '2d6',
    speed: { walk: 30 },
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    saves: {},
    skills: {},
    senses: '',
    languages: '',
    cr: '1/4',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    source: 'SRD',
  };
}

describe('searchNpcs', () => {
  const roster: NpcRecord[] = [
    {
      id: '1',
      name: 'Grix, dock boss',
      kind: 'statted',
      tags: ['criminal', 'dock'],
      faction: 'Harbour rats',
      location: 'Solamento docks',
      notes: 'Escaped with the ledger',
      writeBackHp: true,
      persistentHp: { current: 40, max: 55 },
      lastSeenSession: 12,
    },
    {
      id: '2',
      name: 'Sister Maren',
      kind: 'character',
      tags: ['clergy'],
      faction: 'Temple of the Tide',
      location: 'Upper ward',
      notes: 'Knows about the flooded gallery',
      writeBackHp: false,
    },
  ];

  it('finds by faction, location, tags, and notes', () => {
    expect(searchNpcs(roster, 'harbour').map((n) => n.name)).toEqual([
      'Grix, dock boss',
    ]);
    expect(searchNpcs(roster, 'flooded gallery')[0]?.name).toBe('Sister Maren');
    expect(searchNpcs(roster, 'clergy')[0]?.name).toBe('Sister Maren');
    expect(searchNpcs(roster, 'dock boss')[0]?.name).toBe('Grix, dock boss');
  });
});

describe('npc helpers', () => {
  it('clones from a stat block with persistent HP write-back on by default', () => {
    const npc = npcFromStatBlock(stubBlock('Goblin'), { name: 'Grix, dock boss' });
    expect(npc.name).toBe('Grix, dock boss');
    expect(npc.kind).toBe('statted');
    expect(npc.writeBackHp).toBe(true);
    expect(npc.persistentHp).toEqual({ current: 7, max: 7 });
    expect(npc.statBlock?.ac).toBe(15);
  });

  it('labels wounded with session', () => {
    const npc = npcFromStatBlock(stubBlock('Goblin'));
    npc.persistentHp = { current: 40, max: 55 };
    npc.lastSeenSession = 12;
    expect(woundedLabel(npc)).toBe('wounded, last seen session 12');
  });

  it('imports Open5e-shaped JSON', () => {
    const result = importNpcJson(
      JSON.stringify({
        name: 'Bandit',
        slug: 'bandit',
        armor_class: 12,
        hit_points: 11,
        hit_dice: '2d8+2',
        strength: 11,
        dexterity: 12,
        constitution: 12,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        challenge_rating: '1/8',
        document__slug: 'wotc-srd',
        document__title: 'SRD',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.npc.name).toBe('Bandit');
      expect(result.npc.statBlock?.ac).toBe(12);
    }
  });

  it('paste path surfaces unparsed with review fields', () => {
    const { npc, confidenceNotes } = npcFromPaste('Mystery\nWeird line');
    expect(npc.kind).toBe('statted');
    expect(npc.name).toBe('Mystery');
    expect(confidenceNotes.length).toBeGreaterThan(0);
  });

  it('writes combat HP back and flags wounded with session', () => {
    const grix = npcFromStatBlock(stubBlock('Goblin'), { name: 'Grix' });
    grix.id = 'grix';
    grix.persistentHp = { current: 55, max: 55 };
    const skipped = npcFromStatBlock(stubBlock('Orc'), { name: 'Crowd' });
    skipped.id = 'crowd';
    skipped.writeBackHp = false;

    const { npcs, logs } = applyNpcHpWriteBack(
      [grix, skipped],
      [
        { sourceNpcId: 'grix', hp: 40, maxHp: 55 },
        { sourceNpcId: 'crowd', hp: 2, maxHp: 15 },
      ],
      12,
    );

    expect(npcs[0]?.persistentHp).toEqual({ current: 40, max: 55 });
    expect(npcs[0]?.lastSeenSession).toBe(12);
    expect(npcs[0]?.notes).toContain('wounded, last seen session 12');
    expect(npcs[1]?.persistentHp).toEqual(skipped.persistentHp);
    expect(logs.some((l) => l.includes('Grix'))).toBe(true);
  });
});

describe('statNpc', () => {
  it('keeps who the NPC is while giving them a stat block', () => {
    const npc: NpcRecord = {
      ...blankCharacterNpc('Sable'),
      notes: 'Owes the party a favour',
      tags: ['thieves guild'],
      faction: 'Grey Hands',
      portraitDataUrl: 'data:image/png;base64,xx',
    };
    const statted = statNpc(npc, stubBlock('Bandit'));

    expect(statted.kind).toBe('statted');
    expect(statted.id).toBe(npc.id);
    expect(statted.name).toBe('Sable');
    expect(statted.statBlock?.name).toBe('Sable');
    expect(statted.statBlock?.portraitDataUrl).toBe(npc.portraitDataUrl);
    expect(statted.notes).toBe('Owes the party a favour');
    expect(statted.faction).toBe('Grey Hands');
    expect(statted.persistentHp).toEqual({ current: 7, max: 7 });
    expect(statted.writeBackHp).toBe(true);
  });

  it('falls back to the block name for an unnamed NPC', () => {
    expect(statNpc(blankCharacterNpc(''), stubBlock('Bandit')).name).toBe('');
    expect(
      statNpc(blankCharacterNpc(''), stubBlock('Bandit')).statBlock?.name,
    ).toBe('Bandit');
  });

  it('leaves an already-statted NPC alone', () => {
    const statted = npcFromStatBlock(stubBlock('Bandit'));
    expect(statNpc(statted, stubBlock('Goblin'))).toBe(statted);
  });
});
