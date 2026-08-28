/**
 * Pathbuilder 2e export JSON adapter.
 *
 * ALL Pathbuilder field knowledge lives here. Paste-only — no network fetch.
 */

import type { PartyMember } from '../../types';
import { emptySpellSlots } from '../../types';
import { blankPartyMember } from '../party';
import { abilityModifier } from '../statblock-derived';

export type PathbuilderImportResult =
  | {
      ok: true;
      member: PartyMember;
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

function mod(score: number): number {
  return abilityModifier(score);
}

function computeHp(
  attrs: Record<string, unknown>,
  level: number,
  con: number,
): { maxHp?: number; unread: string[] } {
  const unread: string[] = [];
  const ancestryhp = num(attrs.ancestryhp);
  const classhp = num(attrs.classhp);
  if (ancestryhp == null) unread.push('build.attributes.ancestryhp');
  if (classhp == null) unread.push('build.attributes.classhp');
  if (ancestryhp == null || classhp == null) return { unread };

  const bonushp = num(attrs.bonushp) ?? 0;
  const bonushpPerLevel = num(attrs.bonushpPerLevel) ?? 0;
  const conMod = mod(con);
  // Pathbuilder: ancestry + level * (class + CON + per-level bonus) + flat bonus
  const maxHp =
    ancestryhp + level * (classhp + conMod + bonushpPerLevel) + bonushp;
  return { maxHp, unread };
}

/**
 * Map Pathbuilder 2e export JSON onto a PartyMember for pf2e campaigns.
 */
export function importPathbuilderJson(
  raw: string,
  campaignId: string,
): PathbuilderImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON', unreadFields: [] };
  }

  const root = asRecord(data);
  if (!root) {
    return { ok: false, error: 'JSON must be an object', unreadFields: [] };
  }

  const build = asRecord(root.build) ?? root;
  const unreadFields: string[] = [];
  const warnings: string[] = [];

  const name = str(build.name);
  if (!name) unreadFields.push('build.name');

  const className = str(build.class) ?? '';
  if (!className) unreadFields.push('build.class');

  const level = num(build.level) ?? 1;
  if (num(build.level) == null) unreadFields.push('build.level');

  const ancestry = str(build.ancestry) ?? '';
  if (!ancestry) unreadFields.push('build.ancestry');

  const abilities = asRecord(build.abilities);
  let dex = 10;
  let con = 10;
  let wis = 10;
  if (!abilities) {
    unreadFields.push('build.abilities');
  } else {
    dex = num(abilities.dex) ?? 10;
    con = num(abilities.con) ?? 10;
    wis = num(abilities.wis) ?? 10;
    if (num(abilities.dex) == null) unreadFields.push('build.abilities.dex');
    if (num(abilities.con) == null) unreadFields.push('build.abilities.con');
  }

  const acTotal = asRecord(build.acTotal);
  let ac = 10;
  if (!acTotal || num(acTotal.acTotal) == null) {
    unreadFields.push('build.acTotal.acTotal');
  } else {
    ac = num(acTotal.acTotal)!;
  }

  const attrs = asRecord(build.attributes);
  let maxHp = 10;
  if (!attrs) {
    unreadFields.push('build.attributes');
  } else {
    const hp = computeHp(attrs, level, con);
    unreadFields.push(...hp.unread);
    if (hp.maxHp != null) maxHp = hp.maxHp;
    else warnings.push('Could not compute HP from Pathbuilder attributes');
  }

  // Perception: Pathbuilder often stores under build.perception or proficiencies
  let passivePerception = 10 + mod(wis);
  const perception = num(build.perception);
  if (perception != null) {
    // PF2e perception is a bonus; store as 10+bonus for "passive" glanceability
    passivePerception = 10 + perception;
  } else {
    unreadFields.push('build.perception (estimated 10+WIS mod)');
  }

  if (!name && !className) {
    return {
      ok: false,
      error: 'Unrecognized Pathbuilder JSON — expected build.name and build.class',
      unreadFields,
    };
  }

  const base = blankPartyMember(campaignId, {
    name: name ?? 'Imported PC',
    system: 'pf2e',
  });

  const member: PartyMember = {
    ...base,
    name: name ?? 'Imported PC',
    class: className,
    ancestry,
    level,
    ac,
    maxHp,
    dex,
    passivePerception,
    passiveInvestigation: 10 + mod(num(abilities?.int) ?? 10),
    spellSlots: emptySpellSlots(),
    currentHp: maxHp,
    tempHp: 0,
    importedFrom: 'pathbuilder',
    focusPoints: { current: 1, max: 1 },
    notes: warnings.length
      ? `Imported from Pathbuilder.\n${warnings.join('\n')}`
      : 'Imported from Pathbuilder.',
  };

  return {
    ok: true,
    member,
    warnings,
    unreadFields: [...new Set(unreadFields)],
  };
}
