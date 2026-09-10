import { describe, expect, it } from 'vitest';
import {
  attackHits,
  formatTargetLine,
  resolveAttack,
  resolveAttackOutcome,
  rollAttack,
  rollDamageForOutcome,
} from './attack';
import type { DamagePart } from '../types';

/** Deterministic d20s: hand it the faces you want, in order. */
function scriptedDie(faces: number[]): (sides: number) => number {
  let i = 0;
  return () => faces[i++ % faces.length]!;
}

const greatclub: DamagePart[] = [{ expr: '2d8+4', type: 'bludgeoning' }];

describe('5e attack outcomes', () => {
  const at = (face: number, total: number, ac: number) =>
    resolveAttackOutcome({ face, total, targetAc: ac, system: 'dnd5e' });

  it('hits when the total meets AC', () => {
    expect(at(10, 18, 18)).toBe('hit');
  });

  it('misses when the total is under AC', () => {
    expect(at(10, 17, 18)).toBe('miss');
  });

  it('crits on a natural 20 regardless of AC', () => {
    expect(at(20, 22, 40)).toBe('crit');
  });

  it('misses on a natural 1 regardless of bonus', () => {
    expect(at(1, 31, 10)).toBe('miss');
  });
});

describe('PF2e degrees of success', () => {
  const at = (face: number, total: number, ac: number) =>
    resolveAttackOutcome({ face, total, targetAc: ac, system: 'pf2e' });

  it('crits when beating AC by 10', () => {
    expect(at(15, 28, 18)).toBe('crit');
  });

  it('hits on a plain success', () => {
    expect(at(12, 20, 18)).toBe('hit');
  });

  it('fails by less than 10', () => {
    expect(at(5, 12, 18)).toBe('miss');
  });

  it('critically fails by 10 or more', () => {
    expect(at(2, 8, 18)).toBe('crit-miss');
  });

  it('upgrades one step on a natural 20', () => {
    // 20+3 = 23 vs AC 18 is a success by 5; the nat 20 makes it a crit.
    expect(at(20, 23, 18)).toBe('crit');
  });

  it('downgrades one step on a natural 1', () => {
    // 1+20 = 21 vs AC 18 is a success; the nat 1 drops it to a failure.
    expect(at(1, 21, 18)).toBe('miss');
  });

  it('does not let a natural 20 exceed a critical success', () => {
    expect(at(20, 40, 18)).toBe('crit');
  });
});

describe('advantage and disadvantage', () => {
  it('takes the higher face with advantage', () => {
    const r = rollAttack({
      bonus: 5,
      targetAc: 15,
      system: 'dnd5e',
      mode: 'adv',
      rollDie: scriptedDie([7, 18]),
    });
    expect(r.face).toBe(18);
    expect(r.total).toBe(23);
    expect(r.outcome).toBe('hit');
  });

  it('takes the lower face with disadvantage', () => {
    const r = rollAttack({
      bonus: 5,
      targetAc: 15,
      system: 'dnd5e',
      mode: 'dis',
      rollDie: scriptedDie([7, 18]),
    });
    expect(r.face).toBe(7);
    expect(r.outcome).toBe('miss');
  });
});

describe('crit damage', () => {
  it('doubles the dice but not the modifier in 5e', () => {
    // 2d8+4 becomes 4d8+4, so the range is 8..36 rather than 6..20.
    for (let i = 0; i < 50; i++) {
      const [part] = rollDamageForOutcome(greatclub, {
        outcome: 'crit',
        system: 'dnd5e',
      });
      expect(part!.amount).toBeGreaterThanOrEqual(8);
      expect(part!.amount).toBeLessThanOrEqual(36);
    }
  });

  it('doubles the whole total in PF2e', () => {
    for (let i = 0; i < 50; i++) {
      const [part] = rollDamageForOutcome(greatclub, {
        outcome: 'crit',
        system: 'pf2e',
      });
      // (2d8+4) × 2 → 12..40, and always even.
      expect(part!.amount).toBeGreaterThanOrEqual(12);
      expect(part!.amount).toBeLessThanOrEqual(40);
      expect(part!.amount % 2).toBe(0);
    }
  });

  it('does not double a flat damage value', () => {
    const [part] = rollDamageForOutcome([{ expr: '7', type: 'fire' }], {
      outcome: 'crit',
      system: 'dnd5e',
    });
    expect(part!.amount).toBe(7);
  });

  it('rolls each typed clause on its own', () => {
    const parts = rollDamageForOutcome(
      [
        { expr: '1d8+3', type: 'slashing' },
        { expr: '1d6', type: 'fire' },
      ],
      { outcome: 'hit', system: 'dnd5e' },
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]!.type).toBe('slashing');
    expect(parts[1]!.type).toBe('fire');
  });
});

describe('resolving against several targets', () => {
  const targets = [
    { id: 'a', name: 'Vera', ac: 18 },
    { id: 'b', name: 'Doran', ac: 13 },
  ];

  it('applies damage only to the targets that were hit', () => {
    const res = resolveAttack({
      actorName: 'Ogre',
      actionName: 'Greatclub',
      attackBonus: 6,
      parts: greatclub,
      system: 'dnd5e',
      targets,
      // 11+6=17 misses AC 18; 9+6=15 beats AC 13.
      rollDie: scriptedDie([11, 9]),
    });

    expect(res.rolled).toBe(true);
    expect(res.targets[0]!.attack.outcome).toBe('miss');
    expect(res.targets[0]!.damage).toHaveLength(0);
    expect(res.targets[0]!.total).toBe(0);

    expect(res.targets[1]!.attack.outcome).toBe('hit');
    expect(res.targets[1]!.total).toBeGreaterThan(0);
  });

  it('rolls the attack separately per target', () => {
    const res = resolveAttack({
      actorName: 'Ogre',
      actionName: 'Greatclub',
      attackBonus: 0,
      parts: greatclub,
      system: 'dnd5e',
      targets,
      rollDie: scriptedDie([20, 1]),
    });
    expect(res.targets[0]!.attack.outcome).toBe('crit');
    expect(res.targets[1]!.attack.outcome).toBe('miss');
  });

  it('skips the roll entirely when the action has no attack bonus', () => {
    const res = resolveAttack({
      actorName: 'Dragon',
      actionName: 'Fire Breath',
      attackBonus: undefined,
      parts: [{ expr: '8d6', type: 'fire' }],
      system: 'dnd5e',
      targets,
    });
    // A save-based AoE still lands on everyone selected, as it did before.
    expect(res.rolled).toBe(false);
    expect(res.targets.every((t) => t.total > 0)).toBe(true);
  });
});

describe('log formatting', () => {
  it('reads as one line a DM can scan', () => {
    const res = resolveAttack({
      actorName: 'Ogre',
      actionName: 'Greatclub',
      attackBonus: 6,
      parts: [{ expr: '4', type: 'bludgeoning' }],
      system: 'dnd5e',
      targets: [{ id: 'a', name: 'Vera', ac: 13 }],
      rollDie: scriptedDie([11]),
    });
    expect(formatTargetLine(res.targets[0]!)).toBe(
      'Vera: 11+6=17 vs AC 13, hit — 4 bludgeoning',
    );
  });

  it('says nothing about damage on a miss', () => {
    const res = resolveAttack({
      actorName: 'Ogre',
      actionName: 'Greatclub',
      attackBonus: 0,
      parts: greatclub,
      system: 'dnd5e',
      targets: [{ id: 'a', name: 'Vera', ac: 18 }],
      rollDie: scriptedDie([5]),
    });
    expect(formatTargetLine(res.targets[0]!)).toBe(
      'Vera: 5+0=5 vs AC 18, miss',
    );
  });
});

describe('attackHits', () => {
  it('counts hits and crits, not misses', () => {
    expect(attackHits('hit')).toBe(true);
    expect(attackHits('crit')).toBe(true);
    expect(attackHits('miss')).toBe(false);
    expect(attackHits('crit-miss')).toBe(false);
  });
});
