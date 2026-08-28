/**
 * D&D Beyond paste-import adapter.
 *
 * ALL knowledge of DDB JSON field names lives in this file only.
 * We never fetch from D&D Beyond — the user pastes `/json` output.
 * Shape changes: report unread fields; do not fail silently.
 */

import type { PartyMember } from '../../types';
import { emptySpellSlots } from '../../types';
import { blankPartyMember } from '../party';
import { abilityModifier } from '../statblock-derived';

export type DdbImportResult =
  | {
      ok: true;
      member: Omit<PartyMember, 'id' | 'campaignId'> & {
        id?: string;
        campaignId?: string;
      };
      warnings: string[];
      unreadFields: string[];
    }
  | { ok: false; error: string; unreadFields: string[] };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Stat id map used by DDB character JSON (1=STR … 6=CHA). */
const STAT_DEX = 2;
const STAT_INT = 4;
const STAT_WIS = 5;

function readStat(
  root: Record<string, unknown>,
  statId: number,
): { value?: number; source?: string } {
  const pick = (key: string): number | undefined => {
    const arr = root[key];
    if (!Array.isArray(arr)) return undefined;
    const row = arr.find((s) => asRecord(s)?.id === statId);
    const r = asRecord(row);
    return r ? num(r.value) : undefined;
  };

  const override = pick('overrideStats');
  if (override != null && override > 0) {
    return { value: override, source: 'overrideStats' };
  }
  const base = pick('stats');
  const bonus = pick('bonusStats') ?? 0;
  if (base != null) return { value: base + bonus, source: 'stats+bonusStats' };
  return {};
}

function mod(score: number): number {
  return abilityModifier(score);
}

function readClasses(root: Record<string, unknown>): {
  level: number;
  classLabel: string;
  unread: string[];
} {
  const unread: string[] = [];
  const classes = root.classes;
  if (!Array.isArray(classes) || classes.length === 0) {
    unread.push('classes');
    return { level: 1, classLabel: '', unread };
  }
  let level = 0;
  const names: string[] = [];
  for (const c of classes) {
    const row = asRecord(c);
    if (!row) continue;
    const lvl = num(row.level) ?? 0;
    level += lvl;
    const def = asRecord(row.definition);
    const name = str(def?.name) ?? str(row.name);
    if (name) names.push(lvl > 1 ? `${name} ${lvl}` : name);
  }
  if (level <= 0) {
    unread.push('classes[].level');
    level = 1;
  }
  return { level, classLabel: names.join(' / '), unread };
}

function readAncestry(root: Record<string, unknown>): {
  ancestry: string;
  unread: string[];
} {
  const unread: string[] = [];
  const race = asRecord(root.race);
  if (!race) {
    unread.push('race');
    return { ancestry: '', unread };
  }
  const ancestry =
    str(race.fullName) || str(race.baseRaceName) || str(race.name) || '';
  if (!ancestry) unread.push('race.fullName');
  return { ancestry, unread };
}

function readMaxHp(
  root: Record<string, unknown>,
  level: number,
  conScore: number | undefined,
): { maxHp?: number; unread: string[]; notes: string[] } {
  const unread: string[] = [];
  const notes: string[] = [];
  const override = num(root.overrideHitPoints);
  if (override != null && override > 0) {
    return { maxHp: override, unread, notes: ['HP from overrideHitPoints'] };
  }
  const base = num(root.baseHitPoints);
  if (base == null) {
    unread.push('baseHitPoints');
    return { unread, notes };
  }
  const bonus = num(root.bonusHitPoints) ?? 0;
  const conMod = conScore != null ? mod(conScore) : 0;
  if (conScore == null) {
    unread.push('stats(CON) for HP bonus');
    notes.push('CON missing — HP may be low vs sheet');
  }
  // DDB stores baseHitPoints as the sum of rolled/avg HD without CON in many exports;
  // CON is applied per level when displaying. Common paste shape:
  const maxHp = base + bonus + conMod * level;
  return { maxHp, unread, notes };
}

function readAc(root: Record<string, unknown>): {
  ac?: number;
  unread: string[];
  notes: string[]
} {
  const unread: string[] = [];
  const notes: string[] = [];

  // Rare: precomputed
  const direct = num(root.armorClass) ?? num(root.ac);
  if (direct != null) return { ac: direct, unread, notes };

  // character-service sometimes nests under data
  const modifiers = asRecord(root.modifiers);
  if (modifiers) {
    const bags = ['race', 'class', 'background', 'item', 'feat', 'condition'] as const;
    let bonus = 10;
    let found = false;
    for (const bag of bags) {
      const list = modifiers[bag];
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        const row = asRecord(m);
        if (!row) continue;
        const type = str(row.type)?.toLowerCase();
        const sub = str(row.subType)?.toLowerCase();
        if (type === 'bonus' && sub === 'armor-class') {
          bonus += num(row.value) ?? 0;
          found = true;
        }
        if (type === 'set' && (sub === 'armor-class' || sub === 'unarmored-armor-class')) {
          bonus = num(row.value) ?? bonus;
          found = true;
        }
      }
    }
    if (found) {
      notes.push('AC estimated from modifiers (verify on sheet)');
      return { ac: bonus, unread, notes };
    }
  }

  unread.push('armorClass / modifiers armor-class');
  return { unread, notes };
}

function readSpellSlots(root: Record<string, unknown>): {
  slots: Record<number, { max: number; used: number }>;
  unread: string[];
  notes: string[];
} {
  const slots = emptySpellSlots();
  const unread: string[] = [];
  const notes: string[] = [];

  // Shape A: spellSlots: [{ level, used, available }] or similar
  const raw = root.spellSlots ?? root.spellSlotAvailable;
  if (Array.isArray(raw)) {
    let any = false;
    for (const s of raw) {
      const row = asRecord(s);
      if (!row) continue;
      const level = num(row.level) ?? num(row.spellListId);
      if (level == null || level < 1 || level > 9) continue;
      const max =
        num(row.available) ?? num(row.max) ?? num(row.slotCount) ?? 0;
      const used = num(row.used) ?? 0;
      slots[level] = { max, used: Math.min(used, max) };
      any = true;
    }
    if (any) return { slots, unread, notes };
  }

  // Shape B: nested under classes[].spellRules or characterValues
  unread.push('spellSlots');
  notes.push('Spell slot maxima not found — fill from class table or edit manually');
  return { slots, unread, notes };
}

function readPassives(
  root: Record<string, unknown>,
  wis?: number,
  int?: number,
): {
  perception: number;
  investigation: number;
  unread: string[];
} {
  const unread: string[] = [];
  // Some exports include passiveScores
  const passives = asRecord(root.passiveScores) ?? asRecord(root.passives);
  const fromObj = (key: string): number | undefined => {
    if (!passives) return undefined;
    return num(passives[key]);
  };

  let perception = fromObj('perception') ?? fromObj('passivePerception');
  let investigation =
    fromObj('investigation') ?? fromObj('passiveInvestigation');

  if (perception == null) {
    perception = 10 + (wis != null ? mod(wis) : 0);
    unread.push('passivePerception (estimated 10+WIS)');
  }
  if (investigation == null) {
    investigation = 10 + (int != null ? mod(int) : 0);
    unread.push('passiveInvestigation (estimated 10+INT)');
  }
  return { perception, investigation, unread };
}

/**
 * Map pasted DDB character JSON onto PartyMember sheet+live fields.
 * Returns warnings / unreadFields when the shape drifts.
 */
export function importDdbJson(
  raw: string,
  campaignId: string,
): DdbImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON', unreadFields: [] };
  }

  let root = asRecord(data);
  if (!root) {
    return { ok: false, error: 'JSON must be an object', unreadFields: [] };
  }

  // Some pastes wrap under { data: { ... } } or { character: ... }
  const nested =
    asRecord(root.data) ||
    asRecord(root.character) ||
    asRecord(asRecord(root.data)?.character ?? null);
  if (nested && (nested.name || nested.classes || nested.stats)) {
    root = nested;
  }

  const unreadFields: string[] = [];
  const warnings: string[] = [];

  const name = str(root.name);
  if (!name) unreadFields.push('name');

  const { level, classLabel, unread: classUnread } = readClasses(root);
  unreadFields.push(...classUnread);

  const { ancestry, unread: raceUnread } = readAncestry(root);
  unreadFields.push(...raceUnread);

  const dex = readStat(root, STAT_DEX);
  const int = readStat(root, STAT_INT);
  const wis = readStat(root, STAT_WIS);
  const con = readStat(root, 3);
  if (dex.value == null) unreadFields.push('stats(DEX)');
  if (con.value == null) unreadFields.push('stats(CON)');

  const hp = readMaxHp(root, level, con.value);
  unreadFields.push(...hp.unread);
  warnings.push(...hp.notes);

  const ac = readAc(root);
  unreadFields.push(...ac.unread);
  warnings.push(...ac.notes);

  const slots = readSpellSlots(root);
  unreadFields.push(...slots.unread);
  warnings.push(...slots.notes);

  const passives = readPassives(root, wis.value, int.value);
  unreadFields.push(...passives.unread);

  if (!name && !hp.maxHp && ac.ac == null) {
    return {
      ok: false,
      error:
        'Unrecognized D&D Beyond JSON — expected character name, classes, and hit points',
      unreadFields,
    };
  }

  const maxHp = hp.maxHp ?? 10;
  const removed = num(root.removedHitPoints) ?? 0;
  const temp = num(root.temporaryHitPoints) ?? 0;
  const currentHp = Math.max(0, maxHp - removed);

  const base = blankPartyMember(campaignId, { name: name ?? 'Imported PC' });
  const member: PartyMember = {
    ...base,
    name: name ?? 'Imported PC',
    class: classLabel,
    ancestry,
    level,
    ac: ac.ac ?? 10,
    maxHp,
    dex: dex.value ?? 10,
    passivePerception: passives.perception,
    passiveInvestigation: passives.investigation,
    spellSlots: slots.slots,
    currentHp,
    tempHp: temp,
    importedFrom: 'ddb-json',
    notes: warnings.length
      ? `Imported from D&D Beyond paste.\n${warnings.join('\n')}`
      : 'Imported from D&D Beyond paste.',
  };

  return {
    ok: true,
    member,
    warnings,
    unreadFields: [...new Set(unreadFields)],
  };
}
