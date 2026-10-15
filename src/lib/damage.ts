import type { Combatant } from '../types';

/**
 * `nonLethal` is the pulled punch: the blow that would drop them instead
 * knocks them out. Only the hit that *takes* them to 0 decides it, so a
 * lethal blow landing on someone already out cold finishes the job, and a
 * non-lethal blow on a creature already dying does not quietly stabilise it.
 */
export function applyDamage(
  combatant: Combatant,
  amount: number,
  opts?: { nonLethal?: boolean },
): Pick<Combatant, 'hp' | 'tempHp' | 'unconscious'> {
  const dmg = Math.max(0, Math.floor(amount));
  let remaining = dmg;
  let { tempHp, hp } = combatant;

  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, remaining);
    tempHp -= absorbed;
    remaining -= absorbed;
  }

  const wasStanding = hp > 0;
  hp = Math.max(0, hp - remaining);

  let unconscious = combatant.unconscious === true;
  if (hp > 0) {
    unconscious = false;
  } else if (opts?.nonLethal) {
    // Dropping them is what knocks them out; once down, further pulled
    // punches change nothing.
    if (wasStanding) unconscious = true;
  } else if (wasStanding || remaining > 0) {
    // A real blow that lands on them takes the knockout off the table.
    unconscious = false;
  }

  return { hp, tempHp, unconscious };
}

export function applyHealing(
  combatant: Combatant,
  amount: number,
): Pick<Combatant, 'hp' | 'deathSaves' | 'unconscious'> {
  const heal = Math.max(0, Math.floor(amount));
  const wasDown = combatant.hp <= 0 && combatant.kind === 'pc';
  // Real HP only — never over max, never converted into temp HP.
  const hp = Math.min(combatant.maxHp, combatant.hp + heal);

  return {
    hp,
    deathSaves: wasDown && hp > 0
      ? { successes: 0, failures: 0 }
      : combatant.deathSaves,
    // Back above 0 is back on their feet, however they went down.
    unconscious: hp > 0 ? false : combatant.unconscious,
  };
}

/**
 * Back on their feet. The way out of 0 HP that is not "type a heal number":
 * one click returns a dead enemy or a downed hero at `hp`, clearing the
 * death saves, the PF2e dying counter and the knockout alike.
 */
export function revive(
  combatant: Combatant,
  hp = 1,
): Pick<Combatant, 'hp' | 'deathSaves' | 'unconscious' | 'dying'> {
  return {
    hp: Math.max(1, Math.min(combatant.maxHp, Math.floor(hp))),
    deathSaves: { successes: 0, failures: 0 },
    unconscious: false,
    ...(combatant.dying != null ? { dying: 0 } : {}),
  };
}

/** Down but not dying — knocked out rather than killed. */
export function isOutCold(c: Pick<Combatant, 'hp' | 'unconscious'>): boolean {
  return c.hp <= 0 && c.unconscious === true;
}

export type TempHpOp = 'set' | 'add';

/** `t8` replaces temp HP. `*5` adds. Never goes below 0. */
export function applyTempHp(
  current: number,
  amount: number,
  op: TempHpOp = 'set',
): number {
  if (op === 'add') return Math.max(0, Math.floor(current + amount));
  return Math.max(0, Math.floor(amount));
}

export function setTempHp(amount: number): number {
  return applyTempHp(0, amount, 'set');
}

export function concentrationDC(dmg: number): number {
  return Math.max(10, Math.floor(dmg / 2));
}

export function isBloodied(c: Pick<Combatant, 'hp' | 'maxHp'>): boolean {
  return c.hp > 0 && c.hp <= c.maxHp / 2;
}
