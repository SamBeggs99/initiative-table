import { averageOf } from './dice';
import type { Ability, StatBlock, System } from '../types';
import { newHomebrewId, slugifyName } from './bestiary/ids';

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Hand-applied modifier on top of the printed score. Not an ability-score bump. */
export const ABILITY_BONUS_MIN = -5;
export const ABILITY_BONUS_MAX = 5;

export function abilityBonusOf(
  bonuses: Partial<Record<Ability, number>> | undefined,
  ab: Ability,
): number {
  return bonuses?.[ab] ?? 0;
}

export function adjustAbilityBonus(
  bonuses: Partial<Record<Ability, number>> | undefined,
  ab: Ability,
  delta: number,
): Partial<Record<Ability, number>> | undefined {
  const nextValue = Math.min(
    ABILITY_BONUS_MAX,
    Math.max(ABILITY_BONUS_MIN, abilityBonusOf(bonuses, ab) + delta),
  );
  const next: Partial<Record<Ability, number>> = { ...bonuses };
  if (nextValue === 0) delete next[ab];
  else next[ab] = nextValue;
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Shared ability line for 5e and PF2e — both use scores, not raw modifiers.
 * Example: score 9 → "9 (−1)". Optional `bonus` is a manual modifier overlay.
 */
export function formatAbilityScore(score: number, bonus = 0): string {
  return `${score} (${formatModifier(abilityModifier(score) + bonus)})`;
}

export const ABILITY_LABELS: Record<Ability, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** Proficiency bonus from CR (5e DMG). Overridable in the editor. */
export function proficiencyBonusFromCr(cr: string): number {
  const n = crToNumber(cr);
  if (Number.isNaN(n) || n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}

export function crToNumber(cr: string): number {
  const t = cr.trim();
  if (t === '1/8') return 0.125;
  if (t === '1/4') return 0.25;
  if (t === '1/2') return 0.5;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function hpAvgFromHitDice(hitDice: string): number | null {
  try {
    return Math.floor(averageOf(hitDice));
  } catch {
    return null;
  }
}

/**
 * Rough CR/level estimate from defensive stats — NOT a rules calculation.
 * Labelled as an estimate everywhere it is shown.
 */
export function estimateChallenge(block: Pick<StatBlock, 'hpAvg' | 'ac' | 'cr' | 'pf2e'>): {
  label: string;
  value: string;
  note: string;
} {
  const hp = Math.max(1, block.hpAvg || 1);
  const ac = Math.max(5, block.ac || 10);
  // Crude defensive band used only as a glanceable hint while editing.
  const defensive = Math.round((hp / 15 + (ac - 10) * 0.35) * 2) / 2;
  const clamped = Math.max(0, Math.min(30, defensive));
  const asCr =
    clamped < 0.125
      ? '0'
      : clamped < 0.25
        ? '1/8'
        : clamped < 0.5
          ? '1/4'
          : clamped < 1
            ? '1/2'
            : String(Math.round(clamped));

  if (block.pf2e?.level != null) {
    const lvl = Math.max(-1, Math.min(25, Math.round(clamped)));
    return {
      label: 'Level estimate',
      value: String(lvl),
      note: 'Estimate from HP/AC only — not a calculation. Override Level manually.',
    };
  }

  return {
    label: 'CR estimate',
    value: asCr,
    note: 'Estimate from HP/AC only — not a calculation. Override CR manually.',
  };
}

export function blankStatBlock(
  system: System,
  opts?: { campaignId?: string },
): StatBlock {
  const now = Date.now();
  const name = 'New creature';
  return {
    id: newHomebrewId(),
    system,
    origin: 'homebrew',
    campaignId: opts?.campaignId,
    slug: slugifyName(name),
    name,
    size: system === 'pf2e' ? 'Medium' : 'Medium',
    type: system === 'pf2e' ? 'humanoid' : 'humanoid',
    alignment: system === 'pf2e' ? '' : 'unaligned',
    ac: 10,
    hpAvg: 1,
    hitDice: '1d8',
    speed: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {},
    skills: {},
    senses: '',
    languages: '',
    cr: system === 'pf2e' ? '0' : '0',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    source: 'Homebrew',
    createdAt: now,
    updatedAt: now,
    pf2e:
      system === 'pf2e'
        ? {
            level: 0,
            perception: 0,
            fortitude: 0,
            reflex: 0,
            will: 0,
            traits: [],
            actionCosts: {},
          }
        : undefined,
  };
}

export function draftFromImport(
  parsed: StatBlock,
  opts: { system: System; campaignId?: string; unparsed?: string[] },
): StatBlock {
  return {
    ...parsed,
    id: newHomebrewId(),
    system: opts.system,
    origin: 'homebrew',
    campaignId: opts.campaignId,
    source: 'Homebrew',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pf2e:
      opts.system === 'pf2e'
        ? parsed.pf2e ?? {
            level: Number(parsed.cr) || 0,
            perception: 0,
            fortitude: 0,
            reflex: 0,
            will: 0,
            traits: [],
            actionCosts: {},
          }
        : undefined,
  };
}

export function exportCreatureJson(creature: StatBlock): string {
  return `${JSON.stringify(creature, null, 2)}\n`;
}

/** Copy shown next to export actions — homebrew loss is unacceptable. */
export const HOMEBREW_EXPORT_WARNING =
  'Homebrew is user-authored content and is included in creature, campaign, and full-app exports. Losing it is unacceptable — download a copy before clearing browser data.';

export function abilityKeys(): Ability[] {
  return ['str', 'dex', 'con', 'int', 'wis', 'cha'];
}
