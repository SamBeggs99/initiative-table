import type { Ability, Spell, StatBlock, StatBlockSpellRef, System } from '../types';
import { parseSpellDamage } from './parse';
import {
  ABILITY_NAMES,
  abilityBonusOf,
  abilityModifier,
  formatModifier,
  proficiencyBonusFromCr,
} from './statblock-derived';

export function spellDamageOf(
  spell: Pick<Spell, 'desc' | 'pf2e'> | undefined,
): { expr: string; type: string } | undefined {
  if (!spell) return undefined;
  return spell.pf2e?.damage ?? parseSpellDamage(spell.desc);
}

export function spellRefFromSpell(spell: Spell): StatBlockSpellRef {
  const cantrip =
    spell.level === 0 || Boolean(spell.pf2e?.traits.includes('cantrip'));
  const damage = spellDamageOf(spell);
  return {
    id: spell.id,
    name: spell.name,
    level: cantrip ? 0 : spell.level,
    ...(spell.pf2e?.actions != null ? { actions: spell.pf2e.actions } : {}),
    ...(damage ? { damage } : {}),
  };
}

/** Catalog wins, then the snapshot copied onto the ref at attach time. */
export function resolveSpellRefMeta(
  ref: StatBlockSpellRef,
  catalog?: Spell,
): {
  actions?: StatBlockSpellRef['actions'];
  damage?: StatBlockSpellRef['damage'];
} {
  return {
    actions: catalog?.pf2e?.actions ?? ref.actions,
    damage: spellDamageOf(catalog) ?? ref.damage,
  };
}

export function addSpellRef(
  list: StatBlockSpellRef[] | undefined,
  spell: Spell,
): StatBlockSpellRef[] {
  const next = list ?? [];
  if (next.some((r) => r.id === spell.id)) return next;
  return [...next, spellRefFromSpell(spell)];
}

export function removeSpellRef(
  list: StatBlockSpellRef[] | undefined,
  id: string,
): StatBlockSpellRef[] | undefined {
  const next = (list ?? []).filter((r) => r.id !== id);
  return next.length > 0 ? next : undefined;
}

export function spellGroupLabel(level: number, system: System): string {
  if (level === 0) return 'Cantrips';
  if (system === 'pf2e') return `Rank ${level}`;
  const suf =
    level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suf}-level`;
}

export function groupSpellRefs(
  list: StatBlockSpellRef[] | undefined,
  system: System,
): { level: number; label: string; spells: StatBlockSpellRef[] }[] {
  const groups = new Map<number, StatBlockSpellRef[]>();
  for (const ref of list ?? []) {
    const bucket = groups.get(ref.level) ?? [];
    bucket.push(ref);
    groups.set(ref.level, bucket);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, spells]) => ({
      level,
      label: spellGroupLabel(level, system),
      spells: [...spells].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * Pull prepared-spell names out of a 5e Spellcasting trait (or similar).
 * "Cantrips (at will): fire bolt, light" / "* 1st level (4 slots): shield, mage armor"
 */
export function extractPreparedSpellNames(raw: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\n+/)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    if (!/(cantrip|\d+\s*(st|nd|rd|th)?\s*level|at will)/i.test(head)) continue;
    for (const part of line.slice(colon + 1).split(',')) {
      const name = part
        .replace(/^\s*[\u2022*·-]+\s*/, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

const ABILITY_FROM_NAME: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

export function extractSpellcastingHeader(raw: string): {
  ability?: Ability;
  saveDc?: number;
  attackBonus?: number;
} {
  const abilityMatch = raw.match(
    /spellcasting ability is\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)/i,
  );
  const dcMatch =
    raw.match(/spell save DC\s+(\d+)/i) ||
    raw.match(/spell DC\s+(\d+)/i) ||
    raw.match(/\bDC\s+(\d+)/i);
  const attackMatch =
    raw.match(/\+(\d+)\s+to hit/i) || raw.match(/attack\s+([+-]?\d+)/i);
  const ability = abilityMatch
    ? ABILITY_FROM_NAME[abilityMatch[1]!.toLowerCase()]
    : undefined;
  const saveDc = dcMatch ? Number(dcMatch[1]) : undefined;
  const attackBonus = attackMatch ? Number(attackMatch[1]) : undefined;
  return {
    ...(ability ? { ability } : {}),
    ...(saveDc != null && Number.isFinite(saveDc) ? { saveDc } : {}),
    ...(attackBonus != null && Number.isFinite(attackBonus)
      ? { attackBonus }
      : {}),
  };
}

function abilityModOnBlock(
  block: Pick<StatBlock, 'abilities' | 'abilityBonuses'>,
  ability: Ability,
): number {
  return (
    abilityModifier(block.abilities[ability] ?? 10) +
    abilityBonusOf(block.abilityBonuses, ability)
  );
}

/** 5e: PB + ability. PF2e: expert (level + 4) + ability. */
export function derivedSpellAttackBonus(
  block: Pick<StatBlock, 'system' | 'abilities' | 'abilityBonuses' | 'cr' | 'pf2e'>,
  ability: Ability,
): number {
  const mod = abilityModOnBlock(block, ability);
  if (block.system === 'pf2e') {
    return (block.pf2e?.level ?? 0) + 4 + mod;
  }
  return proficiencyBonusFromCr(block.cr) + mod;
}

/** 5e: 8 + attack. PF2e: 10 + attack. */
export function derivedSpellSaveDc(
  block: Pick<StatBlock, 'system' | 'abilities' | 'abilityBonuses' | 'cr' | 'pf2e'>,
  ability: Ability,
): number {
  const attack = derivedSpellAttackBonus(block, ability);
  return block.system === 'pf2e' ? 10 + attack : 8 + attack;
}

export function resolveSpellcasting(block: StatBlock): {
  ability: Ability;
  abilityLabel: string;
  saveDc: number;
  attackBonus: number;
} | null {
  const casting = block.spellcasting;
  const ability = casting?.ability;
  if (!casting || !ability) return null;
  return {
    ability,
    abilityLabel: ABILITY_NAMES[ability],
    saveDc: casting.saveDc ?? derivedSpellSaveDc(block, ability),
    attackBonus:
      casting.attackBonus ?? derivedSpellAttackBonus(block, ability),
  };
}

export function formatSpellcastingLine(
  casting: NonNullable<ReturnType<typeof resolveSpellcasting>>,
  system: System,
): string {
  const hit = formatModifier(casting.attackBonus);
  if (system === 'pf2e') {
    return `${casting.abilityLabel} DC ${casting.saveDc}, attack ${hit}`;
  }
  return `Spell save DC ${casting.saveDc}, ${hit} to hit (${casting.abilityLabel})`;
}

export function patchSpellcasting(
  current: StatBlock['spellcasting'],
  patch: {
    ability?: Ability | '';
    saveDc?: number | '';
    attackBonus?: number | '';
  },
): StatBlock['spellcasting'] {
  const ability =
    patch.ability === ''
      ? undefined
      : (patch.ability ?? current?.ability);
  if (!ability) return undefined;
  const abilityChanged =
    patch.ability !== undefined && patch.ability !== current?.ability;
  const next: NonNullable<StatBlock['spellcasting']> = { ability };
  const saveDc = abilityChanged && patch.saveDc === undefined
    ? undefined
    : patch.saveDc === ''
      ? undefined
      : patch.saveDc !== undefined
        ? patch.saveDc
        : current?.saveDc;
  const attackBonus = abilityChanged && patch.attackBonus === undefined
    ? undefined
    : patch.attackBonus === ''
      ? undefined
      : patch.attackBonus !== undefined
        ? patch.attackBonus
        : current?.attackBonus;
  if (typeof saveDc === 'number' && Number.isFinite(saveDc)) next.saveDc = saveDc;
  if (typeof attackBonus === 'number' && Number.isFinite(attackBonus)) {
    next.attackBonus = attackBonus;
  }
  return next;
}
