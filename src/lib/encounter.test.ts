import { describe, expect, it } from 'vitest';
import { crToXp, encounterDifficulty, xpThresholdsForLevel } from './encounter';

describe('crToXp', () => {
  it('covers fractions and high CRs', () => {
    expect(crToXp('0')).toBe(10);
    expect(crToXp('1/8')).toBe(25);
    expect(crToXp('1/4')).toBe(50);
    expect(crToXp('1/2')).toBe(100);
    expect(crToXp('1')).toBe(200);
    expect(crToXp('5')).toBe(1800);
    expect(crToXp('30')).toBe(155000);
  });
});

describe('xpThresholdsForLevel', () => {
  it('returns easy/medium/hard/deadly for a level', () => {
    expect(xpThresholdsForLevel(3)).toEqual({
      easy: 75,
      medium: 150,
      hard: 225,
      deadly: 400,
    });
  });
});

describe('encounterDifficulty', () => {
  it('sums XP, applies count multiplier, and returns a tier', () => {
    // 4 goblins CR 1/4 = 50 each = 200 raw; 3-6 monsters => x2 = 400 adjusted
    // party of 4 level-3: thresholds 300/600/900/1600
    const result = encounterDifficulty(
      [{ cr: '1/4' }, { cr: '1/4' }, { cr: '1/4' }, { cr: '1/4' }],
      [{ level: 3 }, { level: 3 }, { level: 3 }, { level: 3 }],
    );
    expect(result.rawXp).toBe(200);
    expect(result.adjustedXp).toBe(400);
    expect(result.thresholds).toEqual({
      easy: 300,
      medium: 600,
      hard: 900,
      deadly: 1600,
    });
    expect(result.tier).toBe('easy');
  });

  it('uses x1 for a single monster', () => {
    const result = encounterDifficulty([{ cr: '5' }], [{ level: 5 }, { level: 5 }, { level: 5 }, { level: 5 }]);
    expect(result.rawXp).toBe(1800);
    expect(result.adjustedXp).toBe(1800);
  });
});
