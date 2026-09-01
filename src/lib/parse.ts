import type { Ability, DamagePart, Entry } from '../types';
import { normalizeDamageType } from './damage-types';

export interface ParsedAttack {
  toHit: number;
}

export interface ParsedDamagePart {
  dice: string;
  type: string;
}

export interface ParsedSaveDC {
  dc: number;
  ability: Ability;
}

export interface ParsedLimitedUse {
  max: number;
  recharge?: string;
  name?: string;
}

const ABILITY_MAP: Record<string, Ability> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha',
};

function normalizeDashes(s: string): string {
  return s.replace(/[−–—]/g, '-').replace(/\u00a0/g, ' ');
}

function normalizeDice(expr: string): string {
  return normalizeDashes(expr).replace(/\s+/g, '');
}

const ORDINAL: Record<string, number> = {
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
  '8th': 8,
  '9th': 9,
};

export function parseAttack(text: string): ParsedAttack | null {
  const src = normalizeDashes(text);
  const m =
    src.match(/([+-]\d+)\s*to hit/i) ||
    src.match(/\b(?:spell\s+)?attack(?:\s+modifier)?\s+([+-]\d+)/i) ||
    src.match(/\bstrike\s+([+-]\d+)/i);
  if (!m) return null;
  return { toHit: Number(m[1]) };
}

export function parseDamage(text: string): ParsedDamagePart[] {
  const src = normalizeDashes(text);
  const results: ParsedDamagePart[] = [];
  // 13 (2d8 + 4) piercing damage  OR  7 (2d6) fire damage
  const re =
    /\d+\s*\(\s*(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*\)\s+([a-z]+)\s+damage/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    results.push({
      dice: normalizeDice(m[1]!),
      type: m[2]!.toLowerCase(),
    });
  }
  return results;
}

/**
 * PF2e (and similar) prose: "dealing 6d6 fire damage",
 * "deals 2d4 electricity damage", "1d6 bludgeoning, piercing, or slashing damage".
 * Skips persistent-only clauses so the primary hit is preferred.
 */
export function parseSpellDamage(
  text: string,
): { expr: string; type: string } | undefined {
  const src = normalizeDashes(text);
  const re =
    /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?!persistent\b)([a-z]+)(?:(?:\s*,\s*[a-z]+)*(?:\s*,?\s+or\s+[a-z]+)?)\s+damage\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const before = src.slice(Math.max(0, m.index - 14), m.index).toLowerCase();
    if (/persistent\s+$/.test(before)) continue;
    return {
      expr: normalizeDice(m[1]!),
      type: normalizeDamageType(m[2]!),
    };
  }
  return undefined;
}

/** Every damage clause on a Hit: line, primary first ("… plus 1d6 fire"). */
export function damagePartsFromDesc(desc: string): DamagePart[] {
  return parseDamage(desc).map((p) => ({
    expr: p.dice,
    type: normalizeDamageType(p.type),
  }));
}

/** Pull the first Hit: damage clause into structured Entry.damage. */
export function damageFieldsFromDesc(desc: string): Entry['damage'] | undefined {
  return damagePartsFromDesc(desc)[0];
}

export function enrichEntryDamage(entry: Entry): Entry {
  if (entry.damage?.expr?.trim()) return entry;
  const [damage, ...extra] = damagePartsFromDesc(entry.desc);
  if (!damage) return entry;
  return {
    ...entry,
    damage,
    ...(extra.length > 0 ? { extraDamage: extra } : {}),
  };
}

/**
 * Pull a Requirements / Requirement / Prerequisite clause from action text.
 * Stops at the next labelled clause (Trigger, Effect, Success, …) when present.
 */
export function requirementsFromDesc(desc: string): string | undefined {
  const src = normalizeDashes(desc);
  const m = src.match(
    /\b(?:Requirements?|Prerequisites?)\s*[:.]?\s*(.+?)(?=\s*(?:Trigger|Effect|Success|Failure|Critical|Frequency|Duration|Saving Throw|Hit:|$))/is,
  );
  const text = m?.[1]?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

export function enrichEntryRequirements(entry: Entry): Entry {
  if (entry.requirements?.trim()) return entry;
  const requirements = requirementsFromDesc(entry.desc);
  return requirements ? { ...entry, requirements } : entry;
}

/**
 * Pull a Duration clause, or a “lasts for …” phrase, from action text.
 * Labelled Duration stops at the first period so a later DC is not swallowed.
 */
export function durationFromDesc(desc: string): string | undefined {
  const src = normalizeDashes(desc);
  const labelled = src.match(/\bDuration\s*[:.]?\s*([^.]+)/i);
  const labelledText = labelled?.[1]?.replace(/\s+/g, ' ').trim();
  if (labelledText) return labelledText;
  const lasts = src.match(/\blasts for\s+([^.;]+)/i);
  const lastsText = lasts?.[1]?.replace(/\s+/g, ' ').trim();
  return lastsText || undefined;
}

export function enrichEntryDuration(entry: Entry): Entry {
  if (entry.duration !== undefined) return entry;
  const duration = durationFromDesc(entry.desc);
  return duration ? { ...entry, duration } : entry;
}

export function saveDcFromDesc(desc: string): number | undefined {
  const parsed = parseSaveDC(desc);
  if (parsed) return parsed.dc;
  const m = normalizeDashes(desc).match(/\bDC\s*(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export function attackBonusFromDesc(desc: string): number | undefined {
  const parsed = parseAttack(desc);
  return parsed?.toHit;
}

export function enrichEntryOffense(entry: Entry): Entry {
  if (entry.attackBonus != null) return entry;
  const attackBonus = attackBonusFromDesc(entry.desc);
  return attackBonus != null ? { ...entry, attackBonus } : entry;
}

/** Fill structured damage, requirements, duration, and offense from free-text. */
export function enrichEntry(entry: Entry): Entry {
  return enrichEntryOffense(
    enrichEntryDuration(enrichEntryRequirements(enrichEntryDamage(entry))),
  );
}

export function formatEntryOffense(
  entry: Pick<Entry, 'attackBonus'>,
): string {
  if (entry.attackBonus == null) return '';
  return entry.attackBonus >= 0
    ? `+${entry.attackBonus}`
    : `${entry.attackBonus}`;
}

export function parseSaveDC(text: string): ParsedSaveDC | null {
  const src = normalizeDashes(text);
  const m = src.match(
    /DC\s*(\d+)\s+([A-Za-z]+)\s*(?:saving throw|save)?/i,
  );
  if (!m) return null;
  const ability = ABILITY_MAP[m[2]!.toLowerCase()];
  if (!ability) return null;
  return { dc: Number(m[1]), ability };
}

export function parseSpellSlots(
  text: string,
): Record<number, { max: number; used: number }> {
  const src = normalizeDashes(text);
  const slots: Record<number, { max: number; used: number }> = {};
  if (/cantrips?\s*\(at will\)/i.test(src) && !/\d(?:st|nd|rd|th)\s+level/i.test(src)) {
    // bare cantrips line alone → empty
  }
  const re = /(\d(?:st|nd|rd|th))\s+level\s*\((\d+)\s*slots?\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const level = ORDINAL[m[1]!.toLowerCase()];
    if (level) {
      slots[level] = { max: Number(m[2]), used: 0 };
    }
  }
  return slots;
}

export function parseLimitedUses(text: string): ParsedLimitedUse | null {
  const src = normalizeDashes(text);

  const legendary = src.match(/Legendary Resistance\s*\((\d+)\s*\/\s*Day\)/i);
  if (legendary) {
    return { max: Number(legendary[1]), name: 'Legendary Resistance' };
  }

  const perDay = src.match(/\((\d+)\s*\/\s*Day\)/i);
  if (perDay) {
    return { max: Number(perDay[1]) };
  }

  const rechargeRange = src.match(/\(Recharge\s+(\d)\s*-\s*(\d)\)/i);
  if (rechargeRange) {
    return { max: 1, recharge: `${rechargeRange[1]}-${rechargeRange[2]}` };
  }

  const rechargeSingle = src.match(/\(Recharge\s+(\d)\)/i);
  if (rechargeSingle) {
    return { max: 1, recharge: rechargeSingle[1] };
  }

  if (/Recharges?\s+after\s+a\s+Short\s+or\s+Long\s+Rest/i.test(src)) {
    return { max: 1, recharge: 'rest' };
  }

  return null;
}

export function parseLegendaryCount(text: string): number {
  const m = normalizeDashes(text).match(/can take\s+(\d+)\s+legendary actions/i);
  if (m) return Number(m[1]);
  return 3;
}
