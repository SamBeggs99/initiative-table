/** Shared damage types for 5e and PF2e action lines. */

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
  damage: { expr: string; type: string } | undefined,
): string | null {
  if (!damage?.expr?.trim()) return null;
  const type = damage.type.trim();
  return type ? `${damage.expr.trim()} ${type}` : damage.expr.trim();
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
