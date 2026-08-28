import { newId } from './lib/uuid';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type System = 'dnd5e' | 'pf2e';

export interface Entry {
  name: string;
  desc: string;
  /**
   * Structured hit damage for the action — same shape for 5e and PF2e.
   * `expr` is dice (`2d6+3`) or a flat number (`8`).
   */
  damage?: {
    expr: string;
    type: string;
  };
  /**
   * Special conditions to use the ability (PF2e Requirements, 5e triggers,
   * “only while bloodied”, etc.). Empty/undefined = none.
   */
  requirements?: string;
}

export interface ActiveCondition {
  name: string;
  /** For valued PF2e conditions (Frightened 2, Clumsy 1, …). */
  value?: number;
  endsOnRound?: number;
  endsOnCombatantId?: string;
  saveEnds?: { dc: number; ability: Ability };
}

export interface LimitedUse {
  name: string;
  max: number;
  used: number;
  recharge?: string;
}

export interface LevelEntry {
  level: number;
  date: number;
  acBefore: number;
  acAfter: number;
  maxHpBefore: number;
  maxHpAfter: number;
  note?: string;
}

export interface Tracker {
  id: string;
  name: string;
  kind: 'counter' | 'clock';
  value: number;
  max?: number;
  scope: 'encounter' | 'campaign';
  autoTick?: 'round-start' | 'round-end' | null;
  color?: string;
}

export interface StatBlock {
  id: string;
  system: System;
  origin: 'synced' | 'bundled' | 'homebrew';
  campaignId?: string;
  slug: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acDesc?: string;
  hpAvg: number;
  hitDice: string;
  speed: Record<string, number | string>;
  abilities: Record<Ability, number>;
  /**
   * Manual modifier overlay (Bless-style +1, a shield, etc.). Does not change
   * the printed ability score — combat math adds this to the derived modifier.
   */
  abilityBonuses?: Partial<Record<Ability, number>>;
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  vulnerabilities?: string;
  resistances?: string;
  immunities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits: Entry[];
  actions: Entry[];
  bonusActions: Entry[];
  reactions: Entry[];
  legendaryDesc?: string;
  legendaryActions: Entry[];
  /**
   * Catalog spells attached to this creature. Listed on the sheet and opened
   * from the library — ids point at the spells Dexie table.
   */
  spellRefs?: StatBlockSpellRef[];
  /**
   * Spellcasting header on the Spells section. Ability drives the auto DC and
   * attack bonus; saveDc / attackBonus override the formula when set.
   */
  spellcasting?: {
    ability: Ability;
    saveDc?: number;
    attackBonus?: number;
  };
  source: string;
  /**
   * Optional portrait / token art as a resized data URL (JPEG/WebP).
   * Survives sync for bundled/synced creatures when preserved on write.
   */
  portraitDataUrl?: string;
  pf2e?: {
    level: number;
    perception: number;
    fortitude: number;
    reflex: number;
    will: number;
    traits: string[];
    actionCosts: Record<string, 1 | 2 | 3 | 'reaction' | 'free'>;
  };
  createdAt?: number;
  updatedAt?: number;
  derivedFromId?: string;
  retired?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  kind: 'pc' | 'npc' | 'lair';
  groupKey?: string;
  sourceNpcId?: string;
  /** Links a PC combatant back to the campaign party roster for live write-back. */
  sourcePartyMemberId?: string;
  /** Sheet class, carried for identity colouring. Never used for game math. */
  charClass?: string;
  initiative: number | null;
  dex: number;
  ac: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  conditions: ActiveCondition[];
  concentrating: boolean;
  reactionUsed: boolean;
  deathSaves: { successes: number; failures: number };
  spellSlots: Record<number, { max: number; used: number }>;
  legendaryActions: { max: number; used: number };
  legendaryResistance: { max: number; used: number };
  limitedUses: LimitedUse[];
  statBlock?: StatBlock;
  notes: string;
  hidden: boolean;
  // --- PF2e (present when campaign.system === 'pf2e'; cleared on system change) ---
  /** Three-action economy: remaining actions this turn (0–3). */
  actionsRemaining?: number;
  /** Multiple attack penalty: 0, then -5, then -10 (agile -4/-8). */
  mapPenalty?: number;
  dying?: number;
  wounded?: number;
  focusPoints?: { current: number; max: number };
  /** Perception used for initiative (no auto-roll). */
  perception?: number;
}

export interface PartyMember {
  id: string;
  campaignId: string;
  name: string;
  playerName: string;
  class: string;
  ancestry: string;
  level: number;
  ac: number;
  maxHp: number;
  dex: number;
  passivePerception: number;
  passiveInvestigation: number;
  spellSlots: Record<number, { max: number; used: number }>;
  currentHp: number;
  tempHp: number;
  levelLog: LevelEntry[];
  notes: string;
  importedFrom?: 'ddb-json' | 'pathbuilder' | 'manual';
  /** PF2e focus points (per character). */
  focusPoints?: { current: number; max: number };
  /** Optional character portrait as a resized data URL. */
  portraitDataUrl?: string;
}

export interface NpcRecord {
  id: string;
  name: string;
  kind: 'statted' | 'character';
  statBlock?: StatBlock;
  persistentHp?: { current: number; max: number };
  role?: string;
  faction?: string;
  location?: string;
  voice?: string;
  wants?: string;
  secret?: string;
  relationships?: { partyMemberId: string; note: string }[];
  tags: string[];
  lastSeenSession?: number;
  notes: string;
  portraitDataUrl?: string;
  writeBackHp?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  system: System;
  party: PartyMember[];
  npcs: NpcRecord[];
  trackers: Tracker[];
  notes: string;
  lastOpened: number;
  sessionNumber?: number;
  /**
   * Per-session DM notetaker entries. Survives end-session; filter by
   * sessionNumber when reviewing. Separate from freeform `notes` (campaign bible).
   * Optional for older persisted campaigns — treat missing as [].
   */
  sessionNotes?: SessionNote[];
  /** PF2e party-level hero points pool. */
  heroPoints?: number;
}

export interface SessionNote {
  id: string;
  sessionNumber: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

/** Planned drop for an encounter pack — awarded once it is on the live fight. */
export type LootKind = 'treasure' | 'item' | 'other';

export interface EncounterLootLine {
  id: string;
  text: string;
  kind: LootKind;
  /** Boss / landmark drop — surfaces first in the award UI. */
  boss?: boolean;
  /** Live-fight only: already handed to the party. */
  awarded?: boolean;
}

export interface SavedEncounter {
  id: string;
  name: string;
  system: System;
  campaignTags: string[];
  entries: {
    creatureId: string;
    nameSnapshot: string;
    quantity: number;
    hpOverride?: number;
    nameOverride?: string;
  }[];
  npcIds: string[];
  trackerPresets: Omit<Tracker, 'id'>[];
  /** Gold, magic items, keys — reminder after the fight. */
  loot: EncounterLootLine[];
  notes: string;
  createdAt: number;
  lastRunAt?: number;
  timesRun: number;
}

export interface LogEntry {
  id: string;
  at: number;
  message: string;
  kind?: 'damage' | 'heal' | 'turn' | 'condition' | 'system' | 'info';
}

export interface CombatState {
  round: number;
  turnIndex: number;
  started: boolean;
  combatants: Combatant[];
  /** Loot carried in from the loaded encounter pack. */
  loot: EncounterLootLine[];
  /** Display name of the pack that seeded loot (if any). */
  sourceEncounterName?: string;
}

export type HpRollMode = 'average' | 'rolled';
export type InitiativeMode = 'group' | 'each' | 'blank';

export type UiDensity = 'comfortable' | 'compact';

/** Day = warm parchment. Night = moonlit glade — same earthy flora, darker canopy. */
export type UiTheme = 'day' | 'night';

export interface Settings {
  hpRollMode: HpRollMode;
  initiativeMode: InitiativeMode;
  /** Banded HP labels on the shared screen / spectator view. */
  hideHpByDefault: boolean;
  /**
   * Table-facing view: hides roster, enlarges combatant names,
   * and mutes damage inputs. Implies hideHpByDefault while on.
   */
  sharedScreen: boolean;
  density: UiDensity;
  theme: UiTheme;
  /**
   * First-run wizard finished or skipped. When false and there are no
   * campaigns, App opens the wizard automatically.
   */
  onboardingComplete: boolean;
}

export interface UndoSnapshot {
  combatantId: string;
  name: string;
  hp: number;
  tempHp: number;
  deathSaves: { successes: number; failures: number };
  kind: 'damage' | 'heal' | 'temp';
}

/** How many HP mutations we keep for Ctrl+Z. */
export const UNDO_STACK_LIMIT = 20;

export interface ConcentrationPrompt {
  combatantId: string;
  name: string;
  dc: number;
  damage: number;
}

export interface StatBlockSpellRef {
  id: string;
  name: string;
  /** 0 = cantrip. Copied from the catalog at attach time for grouping. */
  level: number;
  /** PF2e action cost, copied from the catalog at attach time. */
  actions?: 1 | 2 | 3 | 'reaction' | 'free';
  /** Primary damage, copied from the catalog at attach time when the spell deals any. */
  damage?: {
    expr: string;
    type: string;
  };
}

export interface Spell {
  id: string;
  system: System;
  origin: 'synced' | 'bundled' | 'homebrew';
  campaignId?: string;
  slug: string;
  name: string;
  /** 0 = cantrip (5e) or cantrip-rank (PF2e). */
  level: number;
  /** 5e school, or PF2e school trait (evocation, …). */
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration?: boolean;
  ritual?: boolean;
  /** 5e class lists, or PF2e traditions. */
  classes: string[];
  desc: string;
  higherLevel?: string;
  source: string;
  pf2e?: {
    traditions: string[];
    traits: string[];
    actions: 1 | 2 | 3 | 'reaction' | 'free';
    heighten?: string;
    damage?: {
      expr: string;
      type: string;
    };
  };
  createdAt: number;
  updatedAt: number;
  retired?: boolean;
}

export function emptyCombatState(): CombatState {
  return {
    round: 1,
    turnIndex: 0,
    started: false,
    combatants: [],
    loot: [],
    sourceEncounterName: undefined,
  };
}

export function emptySpellSlots(): Record<number, { max: number; used: number }> {
  const slots: Record<number, { max: number; used: number }> = {};
  for (let i = 1; i <= 9; i++) {
    slots[i] = { max: 0, used: 0 };
  }
  return slots;
}

export function createCombatant(partial: Partial<Combatant> & Pick<Combatant, 'name' | 'kind'>): Combatant {
  return {
    id: newId(),
    initiative: null,
    dex: 10,
    ac: 10,
    hp: 1,
    maxHp: 1,
    tempHp: 0,
    conditions: [],
    concentrating: false,
    reactionUsed: false,
    deathSaves: { successes: 0, failures: 0 },
    spellSlots: emptySpellSlots(),
    legendaryActions: { max: 0, used: 0 },
    legendaryResistance: { max: 0, used: 0 },
    limitedUses: [],
    notes: '',
    hidden: false,
    ...partial,
  };
}
