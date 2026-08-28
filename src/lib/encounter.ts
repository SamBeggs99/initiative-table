/** DMG XP by CR for D&D 5e. */

const CR_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

/** Per-character XP thresholds by level (easy / medium / hard / deadly). */
const LEVEL_THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
};

export type DifficultyTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

export interface DifficultyThresholds {
  easy: number;
  medium: number;
  hard: number;
  deadly: number;
}

export interface EncounterDifficulty {
  rawXp: number;
  adjustedXp: number;
  thresholds: DifficultyThresholds;
  tier: DifficultyTier;
}

export function crToXp(cr: string): number {
  const key = cr.trim();
  const xp = CR_XP[key];
  if (xp === undefined) {
    throw new Error(`Unknown CR: ${cr}`);
  }
  return xp;
}

export function xpThresholdsForLevel(level: number): DifficultyThresholds {
  const clamped = Math.min(20, Math.max(1, Math.floor(level)));
  const row = LEVEL_THRESHOLDS[clamped]!;
  return { easy: row[0], medium: row[1], hard: row[2], deadly: row[3] };
}

export function monsterCountMultiplier(count: number): number {
  if (count <= 0) return 1;
  if (count === 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

function tierFor(adjustedXp: number, t: DifficultyThresholds): DifficultyTier {
  if (adjustedXp < t.easy) return 'trivial';
  if (adjustedXp < t.medium) return 'easy';
  if (adjustedXp < t.hard) return 'medium';
  if (adjustedXp < t.deadly) return 'hard';
  return 'deadly';
}

export function encounterDifficulty(
  monsters: { cr: string }[],
  party: { level: number }[],
): EncounterDifficulty {
  const rawXp = monsters.reduce((sum, m) => sum + crToXp(m.cr), 0);
  const adjustedXp = Math.floor(rawXp * monsterCountMultiplier(monsters.length));

  const thresholds = party.reduce<DifficultyThresholds>(
    (acc, p) => {
      const t = xpThresholdsForLevel(p.level);
      return {
        easy: acc.easy + t.easy,
        medium: acc.medium + t.medium,
        hard: acc.hard + t.hard,
        deadly: acc.deadly + t.deadly,
      };
    },
    { easy: 0, medium: 0, hard: 0, deadly: 0 },
  );

  return {
    rawXp,
    adjustedXp,
    thresholds,
    tier: tierFor(adjustedXp, thresholds),
  };
}
