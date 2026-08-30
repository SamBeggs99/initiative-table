import { applyDamage, applyHealing, setTempHp } from './damage';
import type { Combatant, LevelEntry, PartyMember } from '../types';
import { createCombatant, emptySpellSlots } from '../types';

/** Sheet fields — never written by combat. */
export type PartySheetPatch = Partial<
  Pick<
    PartyMember,
    | 'name'
    | 'playerName'
    | 'class'
    | 'ancestry'
    | 'level'
    | 'ac'
    | 'maxHp'
    | 'dex'
    | 'passivePerception'
    | 'passiveInvestigation'
    | 'notes'
    | 'importedFrom'
    | 'portraitDataUrl'
  >
> & {
  /** Replace slot maxima only; used counts preserved unless omitted level. */
  spellSlotMaxima?: Record<number, number>;
  focusPointsMax?: number;
};

/** Live fields — combat and rests write these; sheet form must not. */
export type PartyLivePatch = Partial<
  Pick<PartyMember, 'currentHp' | 'tempHp' | 'heroPoints'>
> & {
  spellSlotsUsed?: Record<number, number>;
  focusPointsCurrent?: number;
};

/** PF2e table: start a session with 1; award is 1d4+1 so the cap is 5. */
export const HERO_POINT_MAX = 5;
export const HERO_POINT_SESSION_START = 1;

export function clampHeroPoints(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(HERO_POINT_MAX, Math.floor(n)));
}

export function resetHeroPointsForSession(member: PartyMember): PartyMember {
  return { ...member, heroPoints: HERO_POINT_SESSION_START };
}

export function blankPartyMember(
  campaignId: string,
  opts?: { name?: string; system?: 'dnd5e' | 'pf2e' },
): PartyMember {
  const maxHp = 10;
  return {
    id: crypto.randomUUID(),
    campaignId,
    name: opts?.name?.trim() || 'New character',
    playerName: '',
    class: '',
    ancestry: '',
    level: 1,
    ac: 10,
    maxHp,
    dex: 10,
    passivePerception: 10,
    passiveInvestigation: 10,
    spellSlots: emptySpellSlots(),
    currentHp: maxHp,
    tempHp: 0,
    levelLog: [],
    notes: '',
    importedFrom: 'manual',
    focusPoints:
      opts?.system === 'pf2e' ? { current: 1, max: 1 } : undefined,
    heroPoints: opts?.system === 'pf2e' ? HERO_POINT_SESSION_START : undefined,
  };
}

export function proficiencyBonusForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return Math.ceil(lvl / 4) + 1;
}

/** PHB full-caster slots by character level (wizard/cleric/druid/sorcerer/bard). */
const FULL_CASTER: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/** Half-caster (paladin/ranger) — table by class level. */
const HALF_CASTER: Record<number, number[]> = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  8: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  9: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  13: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  14: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  15: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  16: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  17: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  18: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  19: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  20: [4, 3, 3, 3, 2, 0, 0, 0, 0],
};

/** Artificer (third caster) — gains slots at 1. */
const ARTIFICER: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  8: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  9: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  13: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  14: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  15: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  16: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  17: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  18: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  19: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  20: [4, 3, 3, 3, 2, 0, 0, 0, 0],
};

/** Warlock pact magic — slots of a single level (stored in that slot row). */
const WARLOCK_PACT: Record<number, { level: number; count: number }> = {
  1: { level: 1, count: 1 },
  2: { level: 1, count: 2 },
  3: { level: 2, count: 2 },
  4: { level: 2, count: 2 },
  5: { level: 3, count: 2 },
  6: { level: 3, count: 2 },
  7: { level: 4, count: 2 },
  8: { level: 4, count: 2 },
  9: { level: 5, count: 2 },
  10: { level: 5, count: 2 },
  11: { level: 5, count: 3 },
  12: { level: 5, count: 3 },
  13: { level: 5, count: 3 },
  14: { level: 5, count: 3 },
  15: { level: 5, count: 3 },
  16: { level: 5, count: 3 },
  17: { level: 5, count: 4 },
  18: { level: 5, count: 4 },
  19: { level: 5, count: 4 },
  20: { level: 5, count: 4 },
};

function slotsFromRow(row: number[]): Record<number, { max: number; used: number }> {
  const slots = emptySpellSlots();
  for (let i = 0; i < 9; i++) {
    slots[i + 1] = { max: row[i] ?? 0, used: 0 };
  }
  return slots;
}

export type CasterKind = 'full' | 'half' | 'artificer' | 'warlock' | 'none';

export function casterKindForClass(className: string): CasterKind {
  const c = className.trim().toLowerCase();
  if (!c) return 'none';
  if (/(wizard|cleric|druid|sorcerer|bard)/.test(c)) return 'full';
  if (/(paladin|ranger)/.test(c)) return 'half';
  if (/artificer/.test(c)) return 'artificer';
  if (/warlock/.test(c)) return 'warlock';
  return 'none';
}

/** Prefill slot maxima from PHB class tables; used counts reset to 0. Overridable after. */
export function spellSlotsFromClassTable(
  className: string,
  level: number,
): Record<number, { max: number; used: number }> {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  const kind = casterKindForClass(className);
  if (kind === 'full') return slotsFromRow(FULL_CASTER[lvl] ?? FULL_CASTER[1]!);
  if (kind === 'half') return slotsFromRow(HALF_CASTER[lvl] ?? HALF_CASTER[1]!);
  if (kind === 'artificer') return slotsFromRow(ARTIFICER[lvl] ?? ARTIFICER[1]!);
  if (kind === 'warlock') {
    const slots = emptySpellSlots();
    const pact = WARLOCK_PACT[lvl] ?? WARLOCK_PACT[1]!;
    slots[pact.level] = { max: pact.count, used: 0 };
    return slots;
  }
  return emptySpellSlots();
}

/** Apply sheet edits only — never touches currentHp/tempHp/used slots. */
export function applySheetPatch(member: PartyMember, patch: PartySheetPatch): PartyMember {
  const next: PartyMember = { ...member };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.playerName !== undefined) next.playerName = patch.playerName;
  if (patch.class !== undefined) next.class = patch.class;
  if (patch.ancestry !== undefined) next.ancestry = patch.ancestry;
  if (patch.level !== undefined) next.level = patch.level;
  if (patch.ac !== undefined) next.ac = patch.ac;
  if (patch.maxHp !== undefined) next.maxHp = Math.max(1, patch.maxHp);
  if (patch.dex !== undefined) next.dex = patch.dex;
  if (patch.passivePerception !== undefined) {
    next.passivePerception = patch.passivePerception;
  }
  if (patch.passiveInvestigation !== undefined) {
    next.passiveInvestigation = patch.passiveInvestigation;
  }
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.importedFrom !== undefined) next.importedFrom = patch.importedFrom;
  if (patch.portraitDataUrl !== undefined) {
    next.portraitDataUrl = patch.portraitDataUrl || undefined;
  }

  if (patch.spellSlotMaxima) {
    const slots = { ...member.spellSlots };
    for (let lvl = 1; lvl <= 9; lvl++) {
      const max = patch.spellSlotMaxima[lvl];
      if (max === undefined) continue;
      const prev = slots[lvl] ?? { max: 0, used: 0 };
      slots[lvl] = {
        max: Math.max(0, max),
        used: Math.min(prev.used, Math.max(0, max)),
      };
    }
    next.spellSlots = slots;
  }

  if (patch.focusPointsMax !== undefined && member.focusPoints) {
    next.focusPoints = {
      max: Math.max(0, patch.focusPointsMax),
      current: Math.min(member.focusPoints.current, Math.max(0, patch.focusPointsMax)),
    };
  }

  // Clamp live HP if max dropped (sheet change), but never raise current via sheet
  if (next.currentHp > next.maxHp) next.currentHp = next.maxHp;

  return next;
}

/** Apply live edits only — never touches ac, maxHp, level, slot maxima, etc. */
export function applyLivePatch(member: PartyMember, patch: PartyLivePatch): PartyMember {
  const next: PartyMember = { ...member };
  if (patch.currentHp !== undefined) {
    next.currentHp = Math.max(0, Math.min(member.maxHp, patch.currentHp));
  }
  if (patch.tempHp !== undefined) next.tempHp = Math.max(0, patch.tempHp);
  if (patch.spellSlotsUsed) {
    const slots = { ...member.spellSlots };
    for (let lvl = 1; lvl <= 9; lvl++) {
      const used = patch.spellSlotsUsed[lvl];
      if (used === undefined) continue;
      const prev = slots[lvl] ?? { max: 0, used: 0 };
      slots[lvl] = {
        max: prev.max,
        used: Math.max(0, Math.min(prev.max, used)),
      };
    }
    next.spellSlots = slots;
  }
  if (patch.focusPointsCurrent !== undefined && member.focusPoints) {
    next.focusPoints = {
      ...member.focusPoints,
      current: Math.max(
        0,
        Math.min(member.focusPoints.max, patch.focusPointsCurrent),
      ),
    };
  }
  if (patch.heroPoints !== undefined) {
    next.heroPoints = clampHeroPoints(patch.heroPoints);
  }
  return next;
}

/**
 * Apply damage / heal / temp to party live HP (out of combat).
 * Uses the same absorb/cap rules as combatants.
 */
export function adjustPartyLiveHp(
  member: PartyMember,
  kind: 'damage' | 'heal' | 'temp',
  amount: number,
): PartyMember {
  if (kind === 'temp') {
    return applyLivePatch(member, { tempHp: setTempHp(amount) });
  }
  const stub = {
    hp: member.currentHp,
    maxHp: member.maxHp,
    tempHp: member.tempHp,
    kind: 'pc' as const,
    deathSaves: { successes: 0, failures: 0 },
  };
  if (kind === 'heal') {
    const { hp } = applyHealing(stub as Combatant, amount);
    return applyLivePatch(member, { currentHp: hp });
  }
  const { hp, tempHp } = applyDamage(stub as Combatant, amount);
  return applyLivePatch(member, { currentHp: hp, tempHp });
}

export function combatantLinkedToParty(
  memberId: string,
  combatants: Combatant[],
): Combatant | undefined {
  return combatants.find((c) => c.sourcePartyMemberId === memberId);
}

/** Live HP shown on the roster — prefers the combatant while linked. */
export function partyDisplayedHp(
  member: PartyMember,
  combatants: Combatant[],
): {
  currentHp: number;
  maxHp: number;
  tempHp: number;
  inCombat: boolean;
} {
  const linked = combatantLinkedToParty(member.id, combatants);
  if (linked) {
    return {
      currentHp: linked.hp,
      maxHp: linked.maxHp,
      tempHp: linked.tempHp,
      inCombat: true,
    };
  }
  return {
    currentHp: member.currentHp,
    maxHp: member.maxHp,
    tempHp: member.tempHp,
    inCombat: false,
  };
}

/** Live hero points — prefers the combatant while linked. Missing = session start. */
export function partyDisplayedHeroPoints(
  member: PartyMember,
  combatants: Combatant[],
): number {
  const linked = combatantLinkedToParty(member.id, combatants);
  const raw = linked?.heroPoints ?? member.heroPoints;
  return raw != null ? clampHeroPoints(raw) : HERO_POINT_SESSION_START;
}

export interface LevelUpInput {
  acAfter: number;
  maxHpAfter: number;
  note?: string;
  healToFull?: boolean;
  date?: number;
}

export interface LevelUpResult {
  member: PartyMember;
  entry: LevelEntry;
  proficiencyBonus: number;
  suggestSpellSlotUpdate: boolean;
}

export function applyLevelUp(member: PartyMember, input: LevelUpInput): LevelUpResult {
  const newLevel = member.level + 1;
  const entry: LevelEntry = {
    level: newLevel,
    date: input.date ?? Date.now(),
    acBefore: member.ac,
    acAfter: input.acAfter,
    maxHpBefore: member.maxHp,
    maxHpAfter: Math.max(1, input.maxHpAfter),
    note: input.note?.trim() || undefined,
  };

  let next: PartyMember = {
    ...member,
    level: newLevel,
    ac: entry.acAfter,
    maxHp: entry.maxHpAfter,
    levelLog: [...member.levelLog, entry],
  };

  if (input.healToFull !== false) {
    next = applyLivePatch(next, { currentHp: next.maxHp, tempHp: 0 });
  } else if (next.currentHp > next.maxHp) {
    next = applyLivePatch(next, { currentHp: next.maxHp });
  }

  const kind = casterKindForClass(member.class);
  return {
    member: next,
    entry,
    proficiencyBonus: proficiencyBonusForLevel(newLevel),
    suggestSpellSlotUpdate: kind !== 'none',
  };
}

/** Mid-level gear change — edits AC/maxHp without touching level or levelLog. */
export function applyGearChange(
  member: PartyMember,
  patch: { ac?: number; maxHp?: number },
): PartyMember {
  return applySheetPatch(member, {
    ac: patch.ac,
    maxHp: patch.maxHp,
  });
}

export function formatLevelEntry(entry: LevelEntry, prevLevel: number): string {
  const d = new Date(entry.date);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `L${prevLevel} → L${entry.level}, AC ${entry.acBefore} → ${entry.acAfter}, HP ${entry.maxHpBefore} → ${entry.maxHpAfter}, ${date}`;
}

export function partyMemberToCombatant(member: PartyMember): Combatant {
  return createCombatant({
    name: member.name,
    kind: 'pc',
    sourcePartyMemberId: member.id,
    charClass: member.class,
    dex: member.dex,
    ac: member.ac,
    hp: member.currentHp,
    maxHp: member.maxHp,
    tempHp: member.tempHp,
    spellSlots: structuredClone(member.spellSlots),
    focusPoints: member.focusPoints
      ? { ...member.focusPoints }
      : undefined,
    heroPoints:
      member.heroPoints != null
        ? clampHeroPoints(member.heroPoints)
        : undefined,
    // Sheets store perception as a passive score (10 + modifier) for both
    // systems — Pathbuilder writes 10+mod, and the PF2e adapter reads the
    // modifier. Entering a raw PF2e bonus here will be wrong by 10.
    perception: member.passivePerception - 10,
    initiative: null,
  });
}

export function isPartyMemberInCombat(
  memberId: string,
  combatants: Combatant[],
): boolean {
  return combatants.some((c) => c.sourcePartyMemberId === memberId);
}

/** Party members that do not yet have a combatant linked to them. */
export function partyMembersNotInCombat(
  party: PartyMember[],
  combatants: Combatant[],
): PartyMember[] {
  return party.filter((m) => !isPartyMemberInCombat(m.id, combatants));
}

/**
 * Keep the party on the tape: add anyone missing, drop rows whose PC was
 * deleted. Does not reorder existing combatants or touch enemies.
 */
export function ensurePartyCombatants(
  combatants: Combatant[],
  party: PartyMember[],
): { combatants: Combatant[]; added: Combatant[]; removed: number } {
  const partyIds = new Set(party.map((p) => p.id));
  const kept = combatants.filter(
    (c) => !c.sourcePartyMemberId || partyIds.has(c.sourcePartyMemberId),
  );
  const removed = combatants.length - kept.length;
  const present = new Set(
    kept
      .map((c) => c.sourcePartyMemberId)
      .filter((id): id is string => Boolean(id)),
  );
  const added = party
    .filter((p) => !present.has(p.id))
    .map(partyMemberToCombatant);
  return { combatants: [...kept, ...added], added, removed };
}

/** After a fight: party stays, initiative/reaction reset, enemies gone. */
export function restPartyForNextFight(combatants: Combatant[]): Combatant[] {
  return combatants
    .filter((c) => Boolean(c.sourcePartyMemberId))
    .map((c) => ({
      ...c,
      initiative: null,
      reactionUsed: false,
      concentrating: false,
    }));
}

/**
 * Write combat live values back to the party roster.
 * MUST NOT copy combatant.maxHp or combatant.ac onto sheet fields.
 */
export function applyPartyLiveWriteBack(
  party: PartyMember[],
  combatants: Combatant[],
): { party: PartyMember[]; logs: string[] } {
  const byId = new Map<string, Combatant>();
  for (const c of combatants) {
    if (c.sourcePartyMemberId) byId.set(c.sourcePartyMemberId, c);
  }
  if (byId.size === 0) return { party, logs: [] };

  const logs: string[] = [];
  const next = party.map((m) => {
    const c = byId.get(m.id);
    if (!c) return m;
    const used: Record<number, number> = {};
    for (let lvl = 1; lvl <= 9; lvl++) {
      used[lvl] = c.spellSlots[lvl]?.used ?? m.spellSlots[lvl]?.used ?? 0;
    }
    const updated = applyLivePatch(m, {
      currentHp: c.hp,
      tempHp: c.tempHp,
      spellSlotsUsed: used,
      focusPointsCurrent: c.focusPoints?.current,
      ...(c.heroPoints != null ? { heroPoints: c.heroPoints } : {}),
    });
    // Explicit guard — sheet fields must be byte-identical
    if (
      updated.maxHp !== m.maxHp ||
      updated.ac !== m.ac ||
      updated.level !== m.level ||
      updated.dex !== m.dex
    ) {
      throw new Error('applyPartyLiveWriteBack mutated sheet fields');
    }
    logs.push(
      `${m.name} live → ${updated.currentHp}/${m.maxHp} HP` +
        (updated.tempHp ? ` (+${updated.tempHp} temp)` : ''),
    );
    return updated;
  });
  return { party: next, logs };
}

export function longRestPartyMember(member: PartyMember): PartyMember {
  const slots = Object.fromEntries(
    Object.entries(member.spellSlots).map(([lvl, slot]) => [
      lvl,
      { max: slot.max, used: 0 },
    ]),
  ) as PartyMember['spellSlots'];
  return {
    ...member,
    currentHp: member.maxHp,
    tempHp: 0,
    spellSlots: slots,
    focusPoints: member.focusPoints
      ? { ...member.focusPoints, current: member.focusPoints.max }
      : member.focusPoints,
  };
}

/** Short rest: party roster has no X/short abilities yet — no-op on member. */
export function shortRestPartyMember(member: PartyMember): PartyMember {
  return member;
}

export function shortRestCombatant(c: Combatant): Combatant {
  return {
    ...c,
    limitedUses: c.limitedUses.map((u) =>
      u.recharge === 'rest' || u.recharge === 'short' ? { ...u, used: 0 } : u,
    ),
  };
}

export function longRestCombatant(c: Combatant): Combatant {
  return {
    ...c,
    hp: c.maxHp,
    tempHp: 0,
    deathSaves: { successes: 0, failures: 0 },
    reactionUsed: false,
    limitedUses: c.limitedUses.map((u) => ({ ...u, used: 0 })),
    legendaryActions: { ...c.legendaryActions, used: 0 },
    legendaryResistance: { ...c.legendaryResistance, used: 0 },
    focusPoints: c.focusPoints
      ? { ...c.focusPoints, current: c.focusPoints.max }
      : c.focusPoints,
    spellSlots: Object.fromEntries(
      Object.entries(c.spellSlots).map(([lvl, slot]) => [
        lvl,
        { max: slot.max, used: 0 },
      ]),
    ),
  };
}
