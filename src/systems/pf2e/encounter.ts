import type { BudgetMonster, BudgetPartyMember, Difficulty } from '../types';

/** Base XP budgets for a party of 4 (GM Core). */
const BASE_BUDGET_4 = {
  trivial: 40,
  low: 60,
  moderate: 80,
  severe: 120,
  extreme: 160,
} as const;

/** Per-character adjustment away from party size 4. */
const PER_PC = {
  trivial: 10,
  low: 15,
  moderate: 20,
  severe: 30,
  extreme: 40,
} as const;

/**
 * XP awarded for a creature relative to the party's level
 * (standard PF2e encounter-building table).
 */
export function creatureXpForLevelDiff(creatureLevel: number, partyLevel: number): number {
  const diff = creatureLevel - partyLevel;
  if (diff <= -4) return 10;
  if (diff === -3) return 15;
  if (diff === -2) return 20;
  if (diff === -1) return 30;
  if (diff === 0) return 40;
  if (diff === 1) return 60;
  if (diff === 2) return 80;
  if (diff === 3) return 120;
  return 160; // +4 or higher
}

export function pf2eBudgetThresholds(partySize: number): Record<string, number> {
  const delta = partySize - 4;
  return {
    trivial: BASE_BUDGET_4.trivial + delta * PER_PC.trivial,
    low: BASE_BUDGET_4.low + delta * PER_PC.low,
    moderate: BASE_BUDGET_4.moderate + delta * PER_PC.moderate,
    severe: BASE_BUDGET_4.severe + delta * PER_PC.severe,
    extreme: BASE_BUDGET_4.extreme + delta * PER_PC.extreme,
  };
}

function tierFor(xp: number, t: Record<string, number>): string {
  if (xp >= (t.extreme ?? Infinity)) return 'extreme';
  if (xp >= (t.severe ?? Infinity)) return 'severe';
  if (xp >= (t.moderate ?? Infinity)) return 'moderate';
  if (xp >= (t.low ?? Infinity)) return 'low';
  return 'trivial';
}

export function pf2eEncounterBudget(
  monsters: BudgetMonster[],
  party: BudgetPartyMember[],
): Difficulty {
  const partySize = Math.max(1, party.length);
  const partyLevel =
    party.reduce((sum, p) => sum + p.level, 0) / partySize;

  const rawXp = monsters.reduce((sum, m) => {
    if (m.xp != null) return sum + m.xp;
    const level = m.level ?? Number(m.cr ?? 0);
    return sum + creatureXpForLevelDiff(level, partyLevel);
  }, 0);

  const thresholds = pf2eBudgetThresholds(partySize);

  return {
    rawXp,
    adjustedXp: rawXp,
    thresholds,
    tier: tierFor(rawXp, thresholds),
  };
}
