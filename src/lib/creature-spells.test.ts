import { describe, expect, it } from 'vitest';
import type { Spell, StatBlock } from '../types';
import {
  addSpellRef,
  derivedSpellAttackBonus,
  derivedSpellSaveDc,
  extractPreparedSpellNames,
  extractSpellcastingHeader,
  formatSpellcastingLine,
  groupSpellRefs,
  patchSpellcasting,
  removeSpellRef,
  resolveSpellcasting,
  spellGroupLabel,
  spellRefFromSpell,
} from './creature-spells';
import { blankStatBlock } from './statblock-derived';

function spell(partial: Partial<Spell> & Pick<Spell, 'id' | 'name' | 'level'>): Spell {
  return {
    system: 'dnd5e',
    origin: 'bundled',
    slug: partial.name.toLowerCase(),
    school: 'evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    classes: [],
    desc: '',
    source: 'SRD',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('creature spell refs', () => {
  it('adds uniquely and groups like a 5e sheet', () => {
    let list = addSpellRef(undefined, spell({ id: 'a', name: 'Fireball', level: 3 }));
    list = addSpellRef(list, spell({ id: 'b', name: 'Light', level: 0 }));
    list = addSpellRef(list, spell({ id: 'a', name: 'Fireball', level: 3 }));
    list = addSpellRef(list, spell({ id: 'c', name: 'Shield', level: 1 }));

    expect(list.map((r) => r.name)).toEqual(['Fireball', 'Light', 'Shield']);
    const groups = groupSpellRefs(list, 'dnd5e');
    expect(groups.map((g) => g.label)).toEqual([
      'Cantrips',
      '1st-level',
      '3rd-level',
    ]);
    expect(groups[0]!.spells.map((s) => s.name)).toEqual(['Light']);
    expect(removeSpellRef(list, 'b')?.map((r) => r.name)).toEqual([
      'Fireball',
      'Shield',
    ]);
    expect(removeSpellRef([{ id: 'a', name: 'A', level: 1 }], 'a')).toBeUndefined();
  });

  it('snapshots PF2e action cost and parsed damage onto the ref', () => {
    const ref = spellRefFromSpell(
      spell({
        id: 'pf2e:nethys:electric-arc',
        name: 'Electric Arc',
        level: 1,
        system: 'pf2e',
        desc: 'The spell deals 2d4 electricity damage.',
        pf2e: {
          traditions: ['arcane'],
          traits: ['cantrip', 'electricity'],
          actions: 2,
        },
      }),
    );
    expect(ref.level).toBe(0);
    expect(ref.actions).toBe(2);
    expect(ref.damage).toEqual({ expr: '2d4', type: 'electricity' });
  });

  it('labels PF2e ranks', () => {
    expect(spellGroupLabel(0, 'pf2e')).toBe('Cantrips');
    expect(spellGroupLabel(3, 'pf2e')).toBe('Rank 3');
  });

  it('extracts prepared names from a Spellcasting trait', () => {
    const raw = `
The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence.
* Cantrips (at will): fire bolt, light, mage hand, prestidigitation
* 1st level (4 slots): detect magic, mage armor, magic missile, shield
* 3rd level (3 slots): counterspell, fireball, fly
`.trim();
    expect(extractPreparedSpellNames(raw)).toEqual([
      'fire bolt',
      'light',
      'mage hand',
      'prestidigitation',
      'detect magic',
      'mage armor',
      'magic missile',
      'shield',
      'counterspell',
      'fireball',
      'fly',
    ]);
  });

  it('derives 5e spell DC and attack from ability + PB', () => {
    const block = {
      ...blankStatBlock('dnd5e'),
      cr: '5',
      abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
    };
    // CR 5 → PB +3, INT 16 → +3 → attack +6, DC 14
    expect(derivedSpellAttackBonus(block, 'int')).toBe(6);
    expect(derivedSpellSaveDc(block, 'int')).toBe(14);
    expect(
      derivedSpellAttackBonus({ ...block, abilityBonuses: { int: 1 } }, 'int'),
    ).toBe(7);
  });

  it('derives PF2e spell DC as 10 + expert attack', () => {
    const block = {
      ...blankStatBlock('pf2e'),
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 18, cha: 10 },
      pf2e: {
        level: 5,
        perception: 0,
        fortitude: 0,
        reflex: 0,
        will: 0,
        traits: [],
        actionCosts: {},
      },
    };
    // expert 5+4, WIS +4 → attack +13, DC 23
    expect(derivedSpellAttackBonus(block, 'wis')).toBe(13);
    expect(derivedSpellSaveDc(block, 'wis')).toBe(23);
  });

  it('uses printed overrides on the spellcasting header', () => {
    const block: StatBlock = {
      ...blankStatBlock('dnd5e'),
      cr: '5',
      abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
      spellcasting: { ability: 'int', saveDc: 15, attackBonus: 7 },
    };
    const resolved = resolveSpellcasting(block);
    expect(resolved).toMatchObject({ saveDc: 15, attackBonus: 7 });
    expect(formatSpellcastingLine(resolved!, 'dnd5e')).toBe(
      'Spell save DC 15, +7 to hit (Intelligence)',
    );
  });

  it('extracts ability, DC, and attack from a Spellcasting trait', () => {
    expect(
      extractSpellcastingHeader(
        'Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks).',
      ),
    ).toEqual({ ability: 'int', saveDc: 14, attackBonus: 6 });
    expect(
      extractSpellcastingHeader('Divine Prepared Spells DC 21, attack +13'),
    ).toMatchObject({ saveDc: 21, attackBonus: 13 });
  });

  it('clears spellcasting when the ability is removed', () => {
    expect(
      patchSpellcasting({ ability: 'wis', saveDc: 15 }, { ability: '' }),
    ).toBeUndefined();
    expect(patchSpellcasting(undefined, { ability: 'cha' })).toEqual({
      ability: 'cha',
    });
    expect(
      patchSpellcasting({ ability: 'int' }, { saveDc: 16, attackBonus: 8 }),
    ).toEqual({ ability: 'int', saveDc: 16, attackBonus: 8 });
    expect(
      patchSpellcasting(
        { ability: 'int', saveDc: 16, attackBonus: 8 },
        { ability: 'wis' },
      ),
    ).toEqual({ ability: 'wis' });
  });
});
