import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  applyHealing,
  applyTempHp,
  concentrationDC,
  isBloodied,
} from './damage';
import { createCombatant } from '../types';

describe('applyDamage', () => {
  it('absorbs temp HP first then floors at 0', () => {
    const c = createCombatant({
      name: 'T',
      kind: 'npc',
      hp: 20,
      maxHp: 20,
      tempHp: 5,
    });
    expect(applyDamage(c, 3)).toEqual({ hp: 20, tempHp: 2 });
    expect(applyDamage(c, 8)).toEqual({ hp: 17, tempHp: 0 });
    expect(applyDamage({ ...c, tempHp: 0 }, 100)).toEqual({ hp: 0, tempHp: 0 });
  });
});

describe('applyHealing', () => {
  it('caps at maxHp and does not turn overflow into temp HP', () => {
    const c = createCombatant({
      name: 'T',
      kind: 'npc',
      hp: 18,
      maxHp: 20,
      tempHp: 4,
    });
    expect(applyHealing(c, 10).hp).toBe(20);
    expect(applyHealing(c, 10)).not.toHaveProperty('tempHp');
    expect(applyHealing({ ...c, hp: 20 }, 8).hp).toBe(20);
  });

  it('clears death saves when healing a PC at 0', () => {
    const c = createCombatant({
      name: 'Kael',
      kind: 'pc',
      hp: 0,
      maxHp: 40,
      deathSaves: { successes: 1, failures: 2 },
    });
    expect(applyHealing(c, 5)).toEqual({
      hp: 5,
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it('does not clear death saves for NPCs', () => {
    const c = createCombatant({
      name: 'Goblin',
      kind: 'npc',
      hp: 0,
      maxHp: 7,
      deathSaves: { successes: 0, failures: 0 },
    });
    const next = applyHealing(c, 3);
    expect(next.hp).toBe(3);
    expect(next.deathSaves).toEqual(c.deathSaves);
  });
});

describe('applyTempHp', () => {
  it('replaces on set and stacks on add', () => {
    expect(applyTempHp(4, 8, 'set')).toBe(8);
    expect(applyTempHp(4, 5, 'add')).toBe(9);
    expect(applyTempHp(4, -3, 'add')).toBe(1);
    expect(applyTempHp(4, -10, 'add')).toBe(0);
  });
});

describe('concentrationDC', () => {
  it('is max(10, floor(dmg/2))', () => {
    expect(concentrationDC(4)).toBe(10);
    expect(concentrationDC(22)).toBe(11);
  });
});

describe('isBloodied', () => {
  it('is true at half or below while alive', () => {
    expect(isBloodied({ hp: 10, maxHp: 20 })).toBe(true);
    expect(isBloodied({ hp: 11, maxHp: 20 })).toBe(false);
    expect(isBloodied({ hp: 0, maxHp: 20 })).toBe(false);
  });
});
