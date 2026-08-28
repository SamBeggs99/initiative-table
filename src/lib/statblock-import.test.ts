import { describe, expect, it } from 'vitest';
import { parseStatBlockText } from './statblock-import';

const GOBLIN = `
Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (−1) 14 (+2) 10 (+0) 10 (+0) 8 (−1) 8 (−1)
Skills Stealth +6
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.
`.trim();

const YOUNG_GREEN = `
Young Green Dragon
Large dragon, lawful evil
Armor Class 18 (natural armor)
Hit Points 136 (16d10 + 48)
Speed 40 ft., fly 80 ft., swim 40 ft.
STR
19 (+4)
DEX
12 (+1)
CON
17 (+3)
INT
16 (+3)
WIS
13 (+1)
CHA
15 (+2)
Saving Throws Dex +4, Con +6, Wis +4, Cha +5
Skills Deception +5, Perception +7, Stealth +4
Damage Immunities poison
Condition Immunities poisoned
Senses blindsight 30 ft., darkvision 120 ft., passive Perception 17
Languages Common, Draconic
Challenge 8 (3,900 XP)
Amphibious. The dragon can breathe air and water.
Actions
Multiattack. The dragon makes three attacks: one with its bite and two with its claws.
Bite. Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 15 (2d10 + 4) piercing damage plus 7 (2d6) poison damage.
Claw. Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.
Poison Breath (Recharge 5–6). The dragon exhales poisonous gas in a 30-foot cone. Each creature in that area must make a DC 14 Constitution saving throw, taking 42 (12d6) poison damage on a failed save, or half as much damage on a successful one.
`.trim();

describe('parseStatBlockText', () => {
  it('parses a goblin stat block', () => {
    const { statBlock, confidence, unparsed } = parseStatBlockText(GOBLIN);

    expect(statBlock.name).toBe('Goblin');
    expect(statBlock.size).toBe('Small');
    expect(statBlock.type).toMatch(/humanoid/i);
    expect(statBlock.alignment).toMatch(/neutral evil/i);
    expect(statBlock.ac).toBe(15);
    expect(statBlock.acDesc).toMatch(/leather/i);
    expect(statBlock.hpAvg).toBe(7);
    expect(statBlock.hitDice.replace(/\s+/g, '')).toBe('2d6');
    expect(statBlock.speed.walk).toBe(30);
    expect(statBlock.abilities).toEqual({
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
    });
    expect(statBlock.skills.Stealth).toBe(6);
    expect(statBlock.cr).toBe('1/4');
    expect(statBlock.traits.some((t) => t.name === 'Nimble Escape')).toBe(true);
    expect(statBlock.actions.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Scimitar', 'Shortbow']),
    );
    const scimitar = statBlock.actions.find((a) => a.name === 'Scimitar');
    expect(scimitar?.damage).toEqual({ expr: '1d6+2', type: 'slashing' });
    expect(statBlock.system).toBe('dnd5e');
    expect(statBlock.origin).toBe('homebrew');
    expect(confidence.name).toBe('high');
    expect(confidence.ac).toBe('high');
    expect(confidence.abilities).toBe('high');
    expect(unparsed).toEqual([]);
  });

  it('parses abilities on separate lines and CR with comma XP', () => {
    const { statBlock, confidence } = parseStatBlockText(YOUNG_GREEN);

    expect(statBlock.name).toBe('Young Green Dragon');
    expect(statBlock.ac).toBe(18);
    expect(statBlock.hpAvg).toBe(136);
    expect(statBlock.hitDice.replace(/\s+/g, '')).toMatch(/^16d10\+48$/);
    expect(statBlock.speed).toMatchObject({ walk: 40, fly: 80, swim: 40 });
    expect(statBlock.abilities.str).toBe(19);
    expect(statBlock.abilities.cha).toBe(15);
    expect(statBlock.saves.dex).toBe(4);
    expect(statBlock.saves.con).toBe(6);
    expect(statBlock.immunities).toMatch(/poison/i);
    expect(statBlock.conditionImmunities).toMatch(/poisoned/i);
    expect(statBlock.cr).toBe('8');
    expect(statBlock.actions.some((a) => a.name.startsWith('Poison Breath'))).toBe(true);
    expect(confidence.abilities).toBe('high');
    expect(confidence.cr).toBe('high');
  });

  it('accepts CR shorthand and en dashes', () => {
    const raw = `
Kobold
Small humanoid (kobold), lawful evil
Armor Class 12
Hit Points 5 (2d6 − 2)
Speed 30 ft.
STR 7 (−2) DEX 15 (+2) CON 9 (−1) INT 8 (−1) WIS 7 (−2) CHA 8 (−1)
Senses darkvision 60 ft., passive Perception 8
Languages Common, Draconic
CR 1/8 (25 XP)
Pack Tactics. The kobold has advantage on an attack roll against a creature if at least one of the kobold's allies is within 5 feet of the creature and the ally isn't incapacitated.
Actions
Dagger. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.
`.trim();

    const { statBlock } = parseStatBlockText(raw);
    expect(statBlock.cr).toBe('1/8');
    expect(statBlock.hitDice.replace(/\s+/g, '')).toMatch(/^2d6-2$/);
    expect(statBlock.abilities.dex).toBe(15);
  });

  it('surfaces missing fields with low/missing confidence instead of inventing data', () => {
    const { statBlock, confidence, unparsed } = parseStatBlockText('Mystery Beast\nWeird stuff here');
    expect(statBlock.name).toBe('Mystery Beast');
    expect(statBlock.ac).toBe(10);
    expect(confidence.ac).toMatch(/missing|low/);
    expect(confidence.abilities).toMatch(/missing|low/);
    expect(unparsed.length).toBeGreaterThan(0);
  });
});
