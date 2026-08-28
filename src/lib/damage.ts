import type { Combatant } from '../types';

export function applyDamage(
  combatant: Combatant,
  amount: number,
): Pick<Combatant, 'hp' | 'tempHp'> {
  const dmg = Math.max(0, Math.floor(amount));
  let remaining = dmg;
  let { tempHp, hp } = combatant;

  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, remaining);
    tempHp -= absorbed;
    remaining -= absorbed;
  }

  hp = Math.max(0, hp - remaining);
  return { hp, tempHp };
}

export function applyHealing(
  combatant: Combatant,
  amount: number,
): Pick<Combatant, 'hp' | 'deathSaves'> {
  const heal = Math.max(0, Math.floor(amount));
  const wasDown = combatant.hp <= 0 && combatant.kind === 'pc';
  // Real HP only — never over max, never converted into temp HP.
  const hp = Math.min(combatant.maxHp, combatant.hp + heal);

  return {
    hp,
    deathSaves: wasDown && hp > 0
      ? { successes: 0, failures: 0 }
      : combatant.deathSaves,
  };
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
