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
  const hp = Math.min(combatant.maxHp, combatant.hp + heal);

  return {
    hp,
    deathSaves: wasDown && hp > 0
      ? { successes: 0, failures: 0 }
      : combatant.deathSaves,
  };
}

export function setTempHp(amount: number): number {
  return Math.max(0, Math.floor(amount));
}

export function concentrationDC(dmg: number): number {
  return Math.max(10, Math.floor(dmg / 2));
}

export function isBloodied(c: Pick<Combatant, 'hp' | 'maxHp'>): boolean {
  return c.hp > 0 && c.hp <= c.maxHp / 2;
}
