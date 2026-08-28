import { DAMAGE_TYPES } from './damage-types';
import { resolveDamageExpr, rollExpression } from './dice';
import { concentrationDC, isBloodied } from './damage';
import { abilityModifier } from './statblock-derived';
import type { Ability, ActiveCondition, Combatant, LimitedUse } from '../types';
import type { SystemAdapter } from '../systems/types';

/**
 * Fill blank initiatives before sorting into the turn order.
 * Respects the campaign's initiativeMode (group / each / blank) and the
 * system's own initiative rule.
 */
export function fillMissingInitiatives(
  combatants: Combatant[],
  mode: 'group' | 'each' | 'blank',
  adapter: Pick<SystemAdapter, 'initiative' | 'initiativeIsRolled'>,
): Combatant[] {
  if (mode === 'blank') return combatants;
  // Systems that read initiative off a static score (PF2e perception) have
  // nothing to group-roll, so mode collapses to the same answer either way.
  if (!adapter.initiativeIsRolled) {
    return combatants.map((c) =>
      c.initiative == null ? { ...c, initiative: adapter.initiative(c) } : c,
    );
  }
  if (mode === 'group') {
    const groupRoll = rollExpression('d20').total;
    return combatants.map((c) =>
      c.initiative == null
        ? { ...c, initiative: groupRoll + abilityModFromCombatant(c, 'dex') }
        : c,
    );
  }
  return combatants.map((c) =>
    c.initiative == null ? { ...c, initiative: adapter.initiative(c) } : c,
  );
}

export function parseDamageField(raw: string): {
  kind: 'damage' | 'heal' | 'temp';
  amount: number;
} | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('t')) {
    const n = Number(t.slice(1).trim());
    if (!Number.isFinite(n)) return null;
    return { kind: 'temp', amount: n };
  }
  if (t.startsWith('h') || t.startsWith('+')) {
    const n = Number(t.slice(1).trim());
    if (!Number.isFinite(n)) return null;
    return { kind: 'heal', amount: Math.abs(n) };
  }
  // `-12` is damage (same as `12`). applyDamage clamps negatives to 0, so
  // we have to strip the sign here or the field silently no-ops.
  const body = t.startsWith('-') ? t.slice(1).trim() : t;
  const n = Number(body);
  if (!Number.isFinite(n)) return null;
  return { kind: 'damage', amount: Math.abs(n) };
}

/**
 * Row / selection HP field: `12` / `-12` damage, `h12` / `+12` heal, `t8` temp,
 * or a dice expr (`2d6+3` damage, `+2d8` / `h2d8` heal, `-2d6` damage).
 * Optional trailing type (`12 fire`, `-8d6 fire`).
 */
export function resolveHpField(raw: string): {
  kind: 'damage' | 'heal' | 'temp';
  amount: number;
  detail?: string;
  type?: string;
} | null {
  const { expr, type } = splitDamageTypeSuffix(raw);
  if (!expr) return null;
  const parsed = parseDamageField(expr);
  if (parsed) return type ? { ...parsed, type } : parsed;

  const healPrefix = /^[h+]/i.test(expr);
  const tempPrefix = /^t/i.test(expr);
  const dmgPrefix = expr.startsWith('-');
  const body =
    healPrefix || tempPrefix || dmgPrefix ? expr.slice(1).trim() : expr;
  if (!body) return null;
  if (tempPrefix) return null;

  try {
    const rolled = resolveDamageExpr(body);
    return {
      kind: healPrefix ? 'heal' : 'damage',
      amount: Math.max(0, rolled.total),
      detail: rolled.detail,
      type: healPrefix ? undefined : type,
    };
  } catch {
    return null;
  }
}

const DAMAGE_TYPE_SUFFIX = new RegExp(
  `^(.*?)(?:\\s+(${DAMAGE_TYPES.join('|')}))$`,
  'i',
);

/** Pull a known damage type off the end of a HP field (`8d6 fire`). */
export function splitDamageTypeSuffix(raw: string): { expr: string; type?: string } {
  const t = raw.trim();
  if (!t) return { expr: '' };
  const m = DAMAGE_TYPE_SUFFIX.exec(t);
  if (!m) return { expr: t };
  return { expr: (m[1] ?? '').trim(), type: m[2]?.toLowerCase() };
}

export function abilityModFromCombatant(c: Combatant, ability: Ability): number {
  const score = c.statBlock?.abilities[ability] ?? (ability === 'dex' ? c.dex : 10);
  const bonus = c.statBlock?.abilityBonuses?.[ability] ?? 0;
  return abilityModifier(score) + bonus;
}

export function rollAbilitySave(
  c: Combatant,
  ability: Ability,
): { roll: number; total: number; mod: number } {
  const mod = abilityModFromCombatant(c, ability);
  const roll = rollExpression('d20').total;
  return { roll, mod, total: roll + mod };
}

export type DeathSaveOutcome =
  | { kind: 'success'; successes: number; failures: number }
  | { kind: 'failure'; successes: number; failures: number }
  | { kind: 'revive'; hp: 1; successes: 0; failures: 0 }
  | { kind: 'dead'; successes: number; failures: number };

export function resolveDeathSave(
  current: { successes: number; failures: number },
  roll: number,
): DeathSaveOutcome {
  if (roll === 20) {
    return { kind: 'revive', hp: 1, successes: 0, failures: 0 };
  }
  if (roll === 1) {
    const failures = Math.min(3, current.failures + 2);
    return failures >= 3
      ? { kind: 'dead', successes: current.successes, failures }
      : { kind: 'failure', successes: current.successes, failures };
  }
  if (roll >= 10) {
    const successes = Math.min(3, current.successes + 1);
    return { kind: 'success', successes, failures: current.failures };
  }
  const failures = Math.min(3, current.failures + 1);
  return failures >= 3
    ? { kind: 'dead', successes: current.successes, failures }
    : { kind: 'failure', successes: current.successes, failures };
}

/** Parse recharge string "5-6" or "6" — roll d6, true if recharged. */
export function rollRecharge(recharge: string): { roll: number; success: boolean } {
  const cleaned = recharge.replace(/\s+/g, '');
  const range = cleaned.match(/^(\d)-(\d)$/);
  const single = cleaned.match(/^(\d)$/);
  const roll = rollExpression('d6').total;
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return { roll, success: roll >= lo && roll <= hi };
  }
  if (single) {
    const n = Number(single[1]);
    return { roll, success: roll >= n };
  }
  return { roll, success: false };
}

export function processRecharges(
  limitedUses: LimitedUse[],
): { limitedUses: LimitedUse[]; log: string[] } {
  const log: string[] = [];
  const next = limitedUses.map((u) => {
    if (!u.recharge || u.recharge === 'rest' || u.recharge === 'short') return u;
    if (u.used <= 0) return u;
    const { roll, success } = rollRecharge(u.recharge);
    log.push(
      success
        ? `${u.name} recharges on ${roll} (needed ${u.recharge})`
        : `${u.name} fails to recharge (${roll}, needed ${u.recharge})`,
    );
    return success ? { ...u, used: 0 } : u;
  });
  return { limitedUses: next, log };
}

export function expireConditionsAtTurnEnd(
  combatant: Combatant,
  endingCombatantId: string,
): { conditions: ActiveCondition[]; expired: string[] } {
  const expired: string[] = [];
  const conditions = combatant.conditions.filter((cond) => {
    if (cond.endsOnCombatantId === endingCombatantId) {
      expired.push(cond.name);
      return false;
    }
    return true;
  });
  return { conditions, expired };
}

export function expireConditionsForRound(
  combatant: Combatant,
  round: number,
): { conditions: ActiveCondition[]; expired: string[] } {
  const expired: string[] = [];
  const conditions = combatant.conditions.filter((cond) => {
    if (cond.endsOnRound != null && round >= cond.endsOnRound) {
      expired.push(cond.name);
      return false;
    }
    return true;
  });
  return { conditions, expired };
}

export type ResistanceTier = 'normal' | 'resistant' | 'immune' | 'vulnerable';

export function resistanceTier(
  combatant: Combatant,
  damageType: string,
): ResistanceTier {
  const type = damageType.toLowerCase().trim();
  if (!type) return 'normal';
  const block = combatant.statBlock;
  if (!block) return 'normal';
  if (block.immunities?.toLowerCase().includes(type)) return 'immune';
  if (block.resistances?.toLowerCase().includes(type)) return 'resistant';
  if (block.vulnerabilities?.toLowerCase().includes(type)) return 'vulnerable';
  return 'normal';
}

/** Halve / double / zero a hit after looking up the target's damage traits. */
export function applyResistance(base: number, tier: ResistanceTier): number {
  return damageAfterSave({
    baseDamage: base,
    saved: false,
    halfOnSuccess: false,
    tier,
  });
}

/** Apply full or half damage after a save, then resistance/vulnerability. */
export function damageAfterSave(opts: {
  baseDamage: number;
  saved: boolean;
  halfOnSuccess: boolean;
  tier: ResistanceTier;
}): number {
  let dmg = opts.baseDamage;
  if (opts.saved && opts.halfOnSuccess) dmg = Math.floor(dmg / 2);
  if (opts.saved && !opts.halfOnSuccess) dmg = 0;
  if (opts.tier === 'immune') return 0;
  if (opts.tier === 'resistant') dmg = Math.floor(dmg / 2);
  if (opts.tier === 'vulnerable') dmg = dmg * 2;
  return Math.max(0, dmg);
}

/** Bands match hiddenHpLabel: healthy / bloodied / badly bloodied / dead. */
export function hpBarTone(c: Pick<Combatant, 'hp' | 'maxHp'>): 'green' | 'amber' | 'red' | 'empty' {
  if (c.hp <= 0 || c.maxHp <= 0) return 'empty';
  const pct = c.hp / c.maxHp;
  if (pct > 0.5) return 'green';
  if (pct <= 0.25) return 'red';
  return 'amber';
}

/**
 * What a row *is*, for at-a-glance colour coding. Deliberately structural —
 * it reports where the combatant came from, never a guess about allegiance.
 */
export type CombatantRole = 'pc' | 'npc' | 'monster' | 'lair';

export function combatantRole(
  c: Pick<Combatant, 'kind' | 'sourceNpcId'>,
): CombatantRole {
  if (c.kind === 'lair') return 'lair';
  if (c.kind === 'pc') return 'pc';
  return c.sourceNpcId ? 'npc' : 'monster';
}

export const ROLE_LABEL: Record<CombatantRole, string> = {
  pc: 'Player character',
  npc: 'Roster NPC',
  monster: 'Creature',
  lair: 'Lair action',
};

export function hiddenHpLabel(c: Pick<Combatant, 'hp' | 'maxHp'>): string {
  if (c.hp <= 0) return 'Dead';
  if (c.hp <= c.maxHp * 0.25) return 'Badly bloodied';
  if (isBloodied(c)) return 'Bloodied';
  return 'Healthy';
}

export { concentrationDC };
