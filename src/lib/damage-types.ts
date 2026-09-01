/** Shared damage types for 5e and PF2e action lines. */

import type { DamagePart, Entry } from '../types';

export const DAMAGE_TYPES = [
  'slashing',
  'piercing',
  'bludgeoning',
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'psychic',
  'force',
  /** PF2e */
  'bleed',
  'spirit',
  'mental',
  'vitality',
  'void',
] as const;

export type DamageType = (typeof DAMAGE_TYPES)[number];

export function isDamageType(value: string): value is DamageType {
  return (DAMAGE_TYPES as readonly string[]).includes(value);
}

export function normalizeDamageType(raw: string): DamageType | string {
  const t = raw.trim().toLowerCase();
  return isDamageType(t) ? t : t;
}

export function formatEntryDamage(
  damage: DamagePart | undefined,
): string | null {
  if (!damage?.expr?.trim()) return null;
  const type = damage.type.trim();
  return type ? `${damage.expr.trim()} ${type}` : damage.expr.trim();
}

/** Every damage clause on an action, primary first. Blank exprs are dropped. */
export function entryDamageParts(
  entry: Pick<Entry, 'damage' | 'extraDamage'> | undefined,
): DamagePart[] {
  if (!entry) return [];
  return [entry.damage, ...(entry.extraDamage ?? [])].filter(
    (p): p is DamagePart => Boolean(p?.expr?.trim()),
  );
}

/** “2d6+3 slashing plus 1d6 fire”. Null when nothing rolls. */
export function formatDamageParts(parts: DamagePart[]): string | null {
  const bits = parts
    .map((p) => formatEntryDamage(p))
    .filter((b): b is string => Boolean(b));
  return bits.length > 0 ? bits.join(' plus ') : null;
}

/** Split an action's damage clauses off an entry and format them in one go. */
export function formatEntryDamageLine(
  entry: Pick<Entry, 'damage' | 'extraDamage'> | undefined,
): string | null {
  return formatDamageParts(entryDamageParts(entry));
}

/** Brief hit-flash colours for the initiative tape. Untyped uses the damage token. */
export const DAMAGE_TYPE_FLASH: Record<DamageType, string> = {
  slashing: '#c45c5c',
  piercing: '#b56a3a',
  bludgeoning: '#8a7b6c',
  fire: '#e45a32',
  cold: '#4f9fd4',
  lightning: '#e6c84a',
  thunder: '#8b7ec8',
  acid: '#8dbf4a',
  poison: '#5aaa5a',
  necrotic: '#6b4d8a',
  radiant: '#f0d070',
  psychic: '#c47ad0',
  force: '#9b8cff',
  bleed: '#c23a3a',
  spirit: '#6ec4c4',
  mental: '#c47ad0',
  vitality: '#e8d48a',
  void: '#3a3348',
};

export function damageTypeFlashColor(type?: string): string {
  const key = type?.trim().toLowerCase();
  if (key === 'heal') return 'var(--color-heal)';
  if (key && key in DAMAGE_TYPE_FLASH) {
    return DAMAGE_TYPE_FLASH[key as DamageType];
  }
  return 'var(--color-damage)';
}
