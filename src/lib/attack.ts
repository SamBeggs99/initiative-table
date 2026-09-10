import { rollExpression, resolveDamageExpr, type RollResult } from './dice';
import type { DamagePart, System } from '../types';

/**
 * Attack resolution against a target's AC.
 *
 * The pieces for this were already in the app and never joined up: creature
 * editors captured `attackBonus`, the paste importer parsed it out of "+9 to
 * hit", the stat block preview printed it — and nothing ever rolled it. So the
 * loop was: click the action chip, damage lands, and the DM separately decides
 * in their head whether it hit, against an AC the app is already showing them.
 */

export type AttackOutcome = 'crit' | 'hit' | 'miss' | 'crit-miss';

export interface AttackRoll {
  /** The face(s) on the d20. Two when rolled with advantage or disadvantage. */
  faces: number[];
  /** The face that counts. */
  face: number;
  bonus: number;
  total: number;
  targetAc: number;
  outcome: AttackOutcome;
  /** How far over (or under) AC, for PF2e degrees of success. */
  margin: number;
}

export type AttackMode = 'flat' | 'adv' | 'dis';

/**
 * 5e: a natural 20 always hits and crits, a natural 1 always misses.
 * PF2e: beating the DC by 10 upgrades a success to a critical success and
 * failing by 10 downgrades to a critical failure, with a nat 20 / nat 1
 * shifting the degree one step in either direction.
 */
export function resolveAttackOutcome(opts: {
  face: number;
  total: number;
  targetAc: number;
  system: System;
}): AttackOutcome {
  const { face, total, targetAc, system } = opts;
  const margin = total - targetAc;

  if (system === 'pf2e') {
    // Degree from the margin, then shift one step on a natural 20 or 1.
    let degree = margin >= 10 ? 3 : margin >= 0 ? 2 : margin <= -10 ? 0 : 1;
    if (face === 20) degree = Math.min(3, degree + 1);
    else if (face === 1) degree = Math.max(0, degree - 1);
    if (degree === 3) return 'crit';
    if (degree === 2) return 'hit';
    if (degree === 1) return 'miss';
    return 'crit-miss';
  }

  if (face === 20) return 'crit';
  if (face === 1) return 'miss';
  return margin >= 0 ? 'hit' : 'miss';
}

export function rollAttack(opts: {
  bonus: number;
  targetAc: number;
  system: System;
  mode?: AttackMode;
  /** Injected in tests; defaults to a real d20. */
  rollDie?: (sides: number) => number;
}): AttackRoll {
  const { bonus, targetAc, system, mode = 'flat' } = opts;
  const die = opts.rollDie ?? ((sides: number) => Math.floor(Math.random() * sides) + 1);

  const faces = mode === 'flat' ? [die(20)] : [die(20), die(20)];
  const face =
    mode === 'adv'
      ? Math.max(...faces)
      : mode === 'dis'
        ? Math.min(...faces)
        : faces[0]!;

  const total = face + bonus;
  return {
    faces,
    face,
    bonus,
    total,
    targetAc,
    outcome: resolveAttackOutcome({ face, total, targetAc, system }),
    margin: total - targetAc,
  };
}

export function attackHits(outcome: AttackOutcome): boolean {
  return outcome === 'hit' || outcome === 'crit';
}

export interface RolledDamagePart {
  amount: number;
  type?: string;
  detail: string;
}

/**
 * Roll every clause of an action's damage, doubling on a crit.
 *
 * 5e doubles the dice and not the modifier; PF2e doubles the whole total. Both
 * are handled here so the caller only has to say "this was a crit".
 */
export function rollDamageForOutcome(
  parts: DamagePart[],
  opts: { outcome: AttackOutcome; system: System },
): RolledDamagePart[] {
  const crit = opts.outcome === 'crit';
  const pf2e = opts.system === 'pf2e';

  return parts.map((part) => {
    const expr = part.expr.trim();
    const type = part.type.trim() || undefined;

    // PF2e crits double the final total, so roll normally and then double.
    // 5e crits double the dice only, which the roller handles directly.
    const result: RollResult = resolveDamageExpr(
      expr,
      crit && !pf2e ? { critDoubleDice: true } : undefined,
    );
    const amount = crit && pf2e ? result.total * 2 : result.total;
    const detail = crit
      ? `${result.detail}${pf2e ? ' ×2 crit' : ' (crit dice)'}`
      : result.detail;

    return { amount: Math.max(0, amount), type, detail };
  });
}

export interface TargetResolution {
  combatantId: string;
  name: string;
  attack: AttackRoll;
  /** Empty on a miss. */
  damage: RolledDamagePart[];
  total: number;
}

export interface AttackResolution {
  actorName: string;
  actionName: string;
  targets: TargetResolution[];
  /** Set when the action has an attack bonus and so was rolled against AC. */
  rolled: boolean;
}

const OUTCOME_LABEL: Record<AttackOutcome, string> = {
  crit: 'CRIT',
  hit: 'hit',
  miss: 'miss',
  'crit-miss': 'crit miss',
};

export function outcomeLabel(outcome: AttackOutcome): string {
  return OUTCOME_LABEL[outcome];
}

/** One log line per target: `Fighter: 17 vs AC 18, miss`. */
export function formatTargetLine(t: TargetResolution): string {
  const { attack } = t;
  const roll =
    attack.faces.length > 1
      ? `[${attack.faces.join(', ')}]→${attack.face}`
      : `${attack.face}`;
  const head = `${t.name}: ${roll}${
    attack.bonus >= 0 ? `+${attack.bonus}` : attack.bonus
  }=${attack.total} vs AC ${attack.targetAc}, ${outcomeLabel(attack.outcome)}`;
  if (t.damage.length === 0) return head;
  const dmg = t.damage
    .map((d) => `${d.amount} ${d.type ?? 'damage'}`)
    .join(' + ');
  return `${head} — ${dmg}`;
}

export function formatAttackLog(res: AttackResolution): string {
  const head = `${res.actorName} ${res.actionName}`;
  if (res.targets.length === 0) return head;
  return `${head} → ${res.targets.map(formatTargetLine).join(' · ')}`;
}

/**
 * Resolve one action against a set of targets. Damage is rolled per target,
 * because a crit against one is not a crit against another.
 */
export function resolveAttack(opts: {
  actorName: string;
  actionName: string;
  attackBonus: number | undefined;
  parts: DamagePart[];
  system: System;
  mode?: AttackMode;
  targets: { id: string; name: string; ac: number }[];
  rollDie?: (sides: number) => number;
}): AttackResolution {
  const { attackBonus, parts, system, mode, targets } = opts;

  // No printed attack bonus (a save-based AoE, an ability with no roll): keep
  // the old behaviour of applying damage to everyone selected.
  if (attackBonus == null) {
    return {
      actorName: opts.actorName,
      actionName: opts.actionName,
      rolled: false,
      targets: targets.map((t) => {
        const damage = rollDamageForOutcome(parts, { outcome: 'hit', system });
        return {
          combatantId: t.id,
          name: t.name,
          attack: {
            faces: [],
            face: 0,
            bonus: 0,
            total: 0,
            targetAc: t.ac,
            outcome: 'hit' as const,
            margin: 0,
          },
          damage,
          total: damage.reduce((sum, d) => sum + d.amount, 0),
        };
      }),
    };
  }

  return {
    actorName: opts.actorName,
    actionName: opts.actionName,
    rolled: true,
    targets: targets.map((t) => {
      const attack = rollAttack({
        bonus: attackBonus,
        targetAc: t.ac,
        system,
        mode,
        rollDie: opts.rollDie,
      });
      const damage = attackHits(attack.outcome)
        ? rollDamageForOutcome(parts, { outcome: attack.outcome, system })
        : [];
      return {
        combatantId: t.id,
        name: t.name,
        attack,
        damage,
        total: damage.reduce((sum, d) => sum + d.amount, 0),
      };
    }),
  };
}

/** Re-export so callers do not need two imports to roll a bare expression. */
export { rollExpression };
