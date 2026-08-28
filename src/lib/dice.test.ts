import { describe, expect, it } from 'vitest';
import { averageOf, resolveDamageExpr, rollExpression, rollWithAdvantage } from './dice';

describe('rollExpression', () => {
  it('parses NdM+K forms', () => {
    const r = rollExpression('2d6+3');
    expect(r.rolls).toHaveLength(2);
    expect(r.rolls.every((n) => n >= 1 && n <= 6)).toBe(true);
    expect(r.total).toBe(r.rolls[0]! + r.rolls[1]! + 3);
    expect(r.detail).toContain('2d6');
  });

  it('parses bare d20', () => {
    const r = rollExpression('d20');
    expect(r.rolls).toHaveLength(1);
    expect(r.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(r.rolls[0]).toBeLessThanOrEqual(20);
    expect(r.total).toBe(r.rolls[0]);
  });

  it('parses subtraction', () => {
    const r = rollExpression('8d6-2');
    expect(r.rolls).toHaveLength(8);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) - 2);
  });

  it('rejects above 200 dice', () => {
    expect(() => rollExpression('201d6')).toThrow(/200/);
  });
});

describe('rollWithAdvantage', () => {
  it('returns a d20 + mod result with mode', () => {
    const flat = rollWithAdvantage(3, 'flat');
    expect(flat.rolls).toHaveLength(1);
    expect(flat.total).toBe(flat.rolls[0]! + 3);

    const adv = rollWithAdvantage(0, 'adv');
    expect(adv.rolls).toHaveLength(2);
    expect(adv.total).toBe(Math.max(adv.rolls[0]!, adv.rolls[1]!));

    const dis = rollWithAdvantage(2, 'dis');
    expect(dis.rolls).toHaveLength(2);
    expect(dis.total).toBe(Math.min(dis.rolls[0]!, dis.rolls[1]!) + 2);
  });
});

describe('averageOf', () => {
  it('averages hit dice expressions', () => {
    expect(averageOf('18d10+36')).toBe(135);
    expect(averageOf('2d6')).toBe(7);
    expect(averageOf('d8+2')).toBe(6.5);
  });

  it('rejects above 200 dice', () => {
    expect(() => averageOf('201d4')).toThrow(/200/);
  });
});

describe('resolveDamageExpr', () => {
  it('accepts a flat number', () => {
    expect(resolveDamageExpr('8')).toEqual({
      total: 8,
      rolls: [8],
      detail: '8',
    });
  });

  it('rolls a dice expression', () => {
    const r = resolveDamageExpr('2d6+3');
    expect(r.total).toBeGreaterThanOrEqual(5);
    expect(r.total).toBeLessThanOrEqual(15);
    expect(r.rolls).toHaveLength(2);
  });

  it('rejects empty', () => {
    expect(() => resolveDamageExpr('  ')).toThrow(/Empty/);
  });
});
