import { describe, expect, it } from 'vitest';
import {
  combatantRole,
  applyResistance,
  damageAfterSave,
  fillMissingInitiatives,
  hpBarTone,
  parseDamageField,
  resolveDeathSave,
  resolveHpField,
  rollRecharge,
  resistanceTier,
  abilityModFromCombatant,
} from './combat';
import { createCombatant } from '../types';
import { getSystemAdapter } from '../systems';

describe('combatantRole', () => {
  it('classifies pc, lair, roster npc, and bestiary monster', () => {
    expect(combatantRole(createCombatant({ name: 'Aria', kind: 'pc' }))).toBe('pc');
    expect(combatantRole(createCombatant({ name: 'Lair', kind: 'lair' }))).toBe(
      'lair',
    );
    expect(
      combatantRole(
        createCombatant({ name: 'Ireena', kind: 'npc', sourceNpcId: 'n1' }),
      ),
    ).toBe('npc');
    expect(combatantRole(createCombatant({ name: 'Goblin', kind: 'npc' }))).toBe(
      'monster',
    );
  });
});

describe('fillMissingInitiatives', () => {
  const rolled = getSystemAdapter('dnd5e');
  const static_ = getSystemAdapter('pf2e');

  it('keeps initiatives the DM already entered', () => {
    const c = createCombatant({ name: 'Kael', kind: 'pc', initiative: 17 });
    expect(fillMissingInitiatives([c], 'each', rolled)[0].initiative).toBe(17);
    expect(fillMissingInitiatives([c], 'blank', rolled)[0].initiative).toBe(17);
  });

  it('uses the system rule instead of a d20 when initiative is a static score', () => {
    const c = createCombatant({ name: 'Amiri', kind: 'pc', perception: 9 });
    expect(fillMissingInitiatives([c], 'each', static_)[0].initiative).toBe(9);
    // Group mode has nothing to share when nothing is rolled.
    expect(fillMissingInitiatives([c], 'group', static_)[0].initiative).toBe(9);
  });
});

describe('hpBarTone', () => {
  it('bands green above half, amber to a quarter, red below', () => {
    expect(hpBarTone({ hp: 20, maxHp: 20 })).toBe('green');
    expect(hpBarTone({ hp: 11, maxHp: 20 })).toBe('green');
    expect(hpBarTone({ hp: 10, maxHp: 20 })).toBe('amber');
    expect(hpBarTone({ hp: 6, maxHp: 20 })).toBe('amber');
    expect(hpBarTone({ hp: 5, maxHp: 20 })).toBe('red');
    expect(hpBarTone({ hp: 0, maxHp: 20 })).toBe('empty');
  });
});

describe('parseDamageField', () => {
  it('parses damage, heal, and temp prefixes', () => {
    expect(parseDamageField('14')).toEqual({ kind: 'damage', amount: 14 });
    expect(parseDamageField('-12')).toEqual({ kind: 'damage', amount: 12 });
    expect(parseDamageField('- 8')).toEqual({ kind: 'damage', amount: 8 });
    expect(parseDamageField('t8')).toEqual({ kind: 'temp', amount: 8 });
    expect(parseDamageField('t 8')).toEqual({ kind: 'temp', amount: 8 });
    expect(parseDamageField('h12')).toEqual({ kind: 'heal', amount: 12 });
    expect(parseDamageField('+5')).toEqual({ kind: 'heal', amount: 5 });
    expect(parseDamageField('+ 4')).toEqual({ kind: 'heal', amount: 4 });
  });
});

describe('resolveHpField', () => {
  it('keeps numeric prefixes and rolls a dice expression as damage', () => {
    expect(resolveHpField('14')).toEqual({ kind: 'damage', amount: 14 });
    expect(resolveHpField('-12')).toEqual({ kind: 'damage', amount: 12 });
    expect(resolveHpField('+8')).toEqual({ kind: 'heal', amount: 8 });
    expect(resolveHpField('h8')).toEqual({ kind: 'heal', amount: 8 });
    const rolled = resolveHpField('2d1+3');
    expect(rolled).toMatchObject({ kind: 'damage', amount: 5 });
    expect(rolled?.detail).toMatch(/2d1/);
    expect(resolveHpField('-2d1+3')).toMatchObject({
      kind: 'damage',
      amount: 5,
    });
    expect(resolveHpField('+2d1+3')).toMatchObject({
      kind: 'heal',
      amount: 5,
    });
  });

  it('reads a trailing damage type', () => {
    expect(resolveHpField('12 fire')).toEqual({
      kind: 'damage',
      amount: 12,
      type: 'fire',
    });
    expect(resolveHpField('-8 fire')).toEqual({
      kind: 'damage',
      amount: 8,
      type: 'fire',
    });
    expect(resolveHpField('2d1+3 slashing')).toMatchObject({
      kind: 'damage',
      amount: 5,
      type: 'slashing',
    });
    expect(resolveHpField('h2d1+3')).toMatchObject({
      kind: 'heal',
      amount: 5,
    });
  });
});

describe('resolveDeathSave', () => {
  it('handles nat 20, nat 1, and normal outcomes', () => {
    expect(resolveDeathSave({ successes: 0, failures: 0 }, 20)).toEqual({
      kind: 'revive',
      hp: 1,
      successes: 0,
      failures: 0,
    });
    expect(resolveDeathSave({ successes: 0, failures: 1 }, 1).failures).toBe(3);
    expect(resolveDeathSave({ successes: 1, failures: 0 }, 12)).toMatchObject({
      kind: 'success',
      successes: 2,
    });
  });
});

describe('rollRecharge', () => {
  it('accepts 5-6 and 6 forms', () => {
    // statistical smoke — just ensure it returns shape
    const a = rollRecharge('5-6');
    expect(a.roll).toBeGreaterThanOrEqual(1);
    expect(a.roll).toBeLessThanOrEqual(6);
    const b = rollRecharge('6');
    expect(typeof b.success).toBe('boolean');
  });
});

describe('damageAfterSave + resistances', () => {
  it('halves on save then respects resistance', () => {
    expect(
      damageAfterSave({
        baseDamage: 20,
        saved: true,
        halfOnSuccess: true,
        tier: 'resistant',
      }),
    ).toBe(5);
    expect(
      damageAfterSave({
        baseDamage: 20,
        saved: false,
        halfOnSuccess: true,
        tier: 'immune',
      }),
    ).toBe(0);
  });

  it('detects resistance from stat block text', () => {
    const c = createCombatant({
      name: 'Troll',
      kind: 'npc',
      statBlock: {
        id: 'x',
        system: 'dnd5e',
        origin: 'homebrew',
        slug: 'troll',
        name: 'Troll',
        size: 'Large',
        type: 'giant',
        alignment: 'chaotic evil',
        ac: 15,
        hpAvg: 84,
        hitDice: '8d10+40',
        speed: { walk: 30 },
        abilities: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
        saves: {},
        skills: {},
        senses: '',
        languages: '',
        cr: '5',
        traits: [],
        actions: [],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        source: 'Homebrew',
        resistances: 'bludgeoning from nonmagical attacks',
        immunities: 'poison',
      },
    });
    expect(resistanceTier(c, 'poison')).toBe('immune');
    expect(resistanceTier(c, 'bludgeoning')).toBe('resistant');
    expect(resistanceTier(c, 'fire')).toBe('normal');
    expect(abilityModFromCombatant(c, 'str')).toBe(4);
    expect(
      abilityModFromCombatant({
        ...c,
        statBlock: { ...c.statBlock!, abilityBonuses: { str: 1 } },
      }, 'str'),
    ).toBe(5);
  });

  it('applyResistance halves, doubles, or zeroes', () => {
    expect(applyResistance(21, 'resistant')).toBe(10);
    expect(applyResistance(21, 'vulnerable')).toBe(42);
    expect(applyResistance(21, 'immune')).toBe(0);
    expect(applyResistance(21, 'normal')).toBe(21);
  });
});
