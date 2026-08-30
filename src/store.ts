import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  applyResistance,
  concentrationDC,
  fillMissingInitiatives,
  resistanceTier,
  resolveDeathSave,
  rollAbilitySave,
  abilityModFromCombatant,
} from './lib/combat';
import { applyInitiativeMap } from './lib/initiative-prompt';
import {
  applyDamage as applyDamagePure,
  applyHealing as applyHealingPure,
  setTempHp as setTempHpPure,
} from './lib/damage';
import { rollExpression } from './lib/dice';
import {
  advanceCombatTurn,
  beginCombat,
  turnIndexAfterRemove,
} from './lib/turn';
import { getSystemAdapter } from './systems';
import type {
  ActiveCondition,
  Campaign,
  Combatant,
  CombatState,
  ConcentrationPrompt,
  LogEntry,
  NpcRecord,
  PartyMember,
  SavedEncounter,
  Settings,
  SessionNote,
  System,
  Tracker,
  UndoSnapshot,
} from './types';
import { createCombatant, emptyCombatState, UNDO_STACK_LIMIT } from './types';
import { applyNpcHpWriteBack, npcFromStatBlock } from './lib/npc';
import {
  adjustPartyLiveHp,
  applyLevelUp,
  applyLivePatch,
  applyPartyLiveWriteBack,
  applySheetPatch,
  blankPartyMember,
  clampHeroPoints,
  combatantLinkedToParty,
  HERO_POINT_SESSION_START,
  isPartyMemberInCombat,
  longRestCombatant,
  longRestPartyMember,
  partyMembersNotInCombat,
  partyMemberToCombatant,
  resetHeroPointsForSession,
  applyPartySheetToCombatant,
  ensurePartyCombatants,
  restPartyForNextFight,
  shortRestCombatant,
  type LevelUpInput,
  type PartyLivePatch,
  type PartySheetPatch,
} from './lib/party';
import {
  retainCampaignTrackers,
  tickTrackers,
} from './lib/trackers';
import { buildCombatantsFromStatBlock, getCreatureById } from './lib/bestiary';
import {
  activateLootForCombat,
  appendLootToSessionNotes,
  formatLootAwardLog,
  lootForLibrary,
  lootLogKind,
  markAllLootAwarded,
  markLootAwarded,
  pendingLoot,
  stripAwardedLoot,
} from './lib/loot';
import { encounterFromCombat } from './lib/encounter-library';
import {
  exportCampaignPayload,
  parseCampaignImport,
} from './lib/campaign-io';

const defaultSettings: Settings = {
  hpRollMode: 'average',
  initiativeMode: 'group',
  hideHpByDefault: false,
  sharedScreen: false,
  density: 'comfortable',
  theme: 'day',
  onboardingComplete: false,
};

function pushUndo(stack: UndoSnapshot[], snap: UndoSnapshot): UndoSnapshot[] {
  return [...stack, snap].slice(-UNDO_STACK_LIMIT);
}

function sortCombatants(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    const ai = a.initiative ?? -Infinity;
    const bi = b.initiative ?? -Infinity;
    if (bi !== ai) return bi - ai;
    const ad = abilityModFromCombatant(a, 'dex');
    const bd = abilityModFromCombatant(b, 'dex');
    if (bd !== ad) return bd - ad;
    if (a.kind === 'pc' && b.kind !== 'pc') return -1;
    if (b.kind === 'pc' && a.kind !== 'pc') return 1;
    return a.name.localeCompare(b.name);
  });
}

function hydrateNewPartyCombatant(c: Combatant, system: System): Combatant {
  const adapter = getSystemAdapter(system);
  if (adapter.turnStructure !== 'three-action') return c;
  return {
    ...c,
    actionsRemaining: c.actionsRemaining ?? 3,
    mapPenalty: c.mapPenalty ?? 0,
  };
}

function applyPartyToCombatants(
  combatants: Combatant[],
  party: PartyMember[],
  system: System,
): { combatants: Combatant[]; changed: boolean } {
  const { combatants: seated, added, removed } = ensurePartyCombatants(
    combatants,
    party,
  );
  const partyById = new Map(party.map((p) => [p.id, p]));
  const addedIds = new Set(added.map((c) => c.id));
  let sheetChanged = false;
  const next = seated.map((c) => {
    const row = addedIds.has(c.id) ? hydrateNewPartyCombatant(c, system) : c;
    const member = row.sourcePartyMemberId
      ? partyById.get(row.sourcePartyMemberId)
      : undefined;
    if (!member) return row;
    const synced = applyPartySheetToCombatant(row, member);
    if (synced !== row) sheetChanged = true;
    return synced;
  });
  if (added.length === 0 && removed === 0 && !sheetChanged) {
    return { combatants, changed: false };
  }
  return { combatants: next, changed: true };
}

function combatKeepingParty(
  combat: CombatState,
  party: PartyMember[],
  system: System,
): CombatState {
  const rested = restPartyForNextFight(combat.combatants);
  const { combatants } = applyPartyToCombatants(rested, party, system);
  return { ...emptyCombatState(), combatants };
}

/** Pull PCs who are not already on the tape. Returns how many were added. */
function pullMissingParty(get: () => AppState): number {
  const campaign = get().getActiveCampaign();
  const missing = campaign
    ? partyMembersNotInCombat(campaign.party, get().getActiveCombat().combatants)
    : [];
  for (const m of missing) {
    get().addCombatant(partyMemberToCombatant(m));
  }
  if (missing.length > 0) {
    get().pushLog(
      `Added ${missing.length} party member${missing.length === 1 ? '' : 's'} to the encounter`,
      'system',
    );
  }
  return missing.length;
}

function patchActiveCombat(
  combatByCampaign: Record<string, CombatState>,
  campaignId: string | null,
  patch: Partial<CombatState> | ((c: CombatState) => CombatState),
): Record<string, CombatState> {
  if (!campaignId) return combatByCampaign;
  const current = combatByCampaign[campaignId] ?? emptyCombatState();
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return { ...combatByCampaign, [campaignId]: next };
}

function stripSystemSpecificCampaign(campaign: Campaign, nextSystem: System): Campaign {
  const adapter = getSystemAdapter(nextSystem);
  return {
    ...campaign,
    system: nextSystem,
    heroPoints: undefined,
    party: campaign.party.map((p) => ({
      ...p,
      focusPoints:
        adapter.resources.kind === 'focus-hero'
          ? (p.focusPoints ?? { current: 1, max: 1 })
          : undefined,
      heroPoints:
        adapter.resources.kind === 'focus-hero'
          ? (p.heroPoints ?? 1)
          : undefined,
      spellSlots:
        adapter.resources.kind === 'slots-legendary'
          ? p.spellSlots
          : Object.fromEntries(
              Object.entries(p.spellSlots).map(([lvl]) => [lvl, { max: 0, used: 0 }]),
            ),
    })),
  };
}

/**
 * Stable empty fallbacks. Selectors must never build a fresh object/array —
 * useSyncExternalStore compares by reference and would re-render forever.
 */
export const EMPTY_COMBAT: CombatState = Object.freeze({
  round: 1,
  turnIndex: 0,
  started: false,
  combatants: Object.freeze([]) as unknown as Combatant[],
  loot: Object.freeze([]) as unknown as CombatState['loot'],
}) as CombatState;
export const EMPTY_COMBATANTS: Combatant[] = EMPTY_COMBAT.combatants;
export const EMPTY_TRACKERS: Tracker[] = Object.freeze([]) as unknown as Tracker[];

/** Campaigns + settings persisted locally and copied to the cloud (no undo/log/toasts). */
export type PersistSlice = {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  encounters: SavedEncounter[];
  combatByCampaign: Record<string, CombatState>;
  settings: Settings;
};

export function getPersistSlice(state: PersistSlice): PersistSlice {
  return {
    campaigns: state.campaigns,
    activeCampaignId: state.activeCampaignId,
    encounters: state.encounters,
    combatByCampaign: state.combatByCampaign,
    settings: state.settings,
  };
}

export function mergePersistedState(
  persisted: unknown,
  current: AppState,
): AppState {
  const p = (persisted ?? {}) as Partial<AppState> & {
    undoSnapshot?: UndoSnapshot | null;
  };
  const migratedStack =
    p.undoStack ?? (p.undoSnapshot ? [p.undoSnapshot] : current.undoStack);
  const campaigns = (p.campaigns ?? current.campaigns).map((c) => ({
    ...c,
    sessionNotes: Array.isArray(c.sessionNotes) ? c.sessionNotes : [],
  }));
  const encounters = (p.encounters ?? current.encounters).map((e) => ({
    ...e,
    loot: Array.isArray(e.loot) ? e.loot : [],
  }));
  const rawCombat = p.combatByCampaign ?? current.combatByCampaign;
  const combatByCampaign = Object.fromEntries(
    Object.entries(rawCombat).map(([id, c]) => [
      id,
      {
        ...emptyCombatState(),
        ...c,
        combatants: Array.isArray(c.combatants) ? c.combatants : [],
        loot: Array.isArray(c.loot) ? c.loot : [],
      },
    ]),
  );
  for (const camp of campaigns) {
    const live = combatByCampaign[camp.id] ?? emptyCombatState();
    const { combatants } = applyPartyToCombatants(
      live.combatants,
      camp.party ?? [],
      camp.system,
    );
    combatByCampaign[camp.id] = {
      ...live,
      combatants: live.started
        ? combatants
        : combatants.map((x) => ({ ...x, initiative: null })),
    };
  }
  return {
    ...current,
    ...p,
    campaigns,
    encounters,
    combatByCampaign,
    settings: { ...defaultSettings, ...p.settings },
    undoStack: Array.isArray(migratedStack) ? migratedStack : [],
  };
}

export interface AppState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  encounters: SavedEncounter[];
  combatByCampaign: Record<string, CombatState>;
  log: LogEntry[];
  settings: Settings;
  /** Most-recent HP mutation is at the end. Caps at UNDO_STACK_LIMIT. */
  undoStack: UndoSnapshot[];
  concentrationPrompt: ConcentrationPrompt | null;
  /** Ephemeral — Start combat collects scores before sorting the tape. */
  initiativePromptOpen: boolean;
  toasts: { id: string; message: string; at: number }[];

  getActiveCombat: () => CombatState;
  getActiveCampaign: () => Campaign | null;

  createCampaign: (name: string, system?: System) => string;
  updateCampaign: (id: string, patch: Partial<Omit<Campaign, 'id'>>) => void;
  /** Change system; clears system-specific combatant/party resources. */
  changeCampaignSystem: (id: string, system: System) => void;
  deleteCampaign: (id: string) => void;
  setActiveCampaign: (id: string | null) => void;

  upsertEncounter: (encounter: SavedEncounter) => void;
  deleteEncounter: (id: string) => void;
  /** Seat any missing PCs on the live tape without starting combat. */
  syncPartyToTape: () => void;
  /**
   * Wipe enemies, loot, and turn state. Party stays on the tracker (no HP write-back).
   */
  clearEncounter: (opts?: { silent?: boolean }) => void;
  /**
   * End session: write live HP back, increment sessionNumber, clear encounter
   * trackers and combat.
   */
  endSession: () => void;
  /** Load a library encounter into the active campaign combat (caller resolved deps). */
  loadEncounter: (
    encounter: SavedEncounter,
    opts?: {
      creatureIdMap?: Record<string, string>;
      omitCreatures?: string[];
      omitNpcs?: string[];
    },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  saveCombatAsEncounter: (name: string, tags?: string[]) => string | null;
  importCampaignJson: (raw: string) => { ok: true; id: string } | { ok: false; error: string };
  exportActiveCampaignJson: () => string | null;

  addCombatant: (combatant: Combatant) => void;
  removeCombatant: (id: string) => void;
  updateCombatant: (id: string, patch: Partial<Combatant>) => void;
  applyDamage: (id: string, amount: number, opts?: { type?: string }) => void;
  applyHealing: (id: string, amount: number) => void;
  setTempHp: (id: string, amount: number) => void;
  rollDeathSave: (id: string) => void;
  addLairAction: () => void;
  addCondition: (id: string, condition: ActiveCondition) => void;
  removeCondition: (id: string, name: string) => void;
  clearConcentrationPrompt: () => void;
  rollConcentrationSave: () => void;
  dropConcentration: () => void;

  nextTurn: () => void;
  prevTurn: () => void;
  /** Pull missing PCs onto the tape, then open the initiative prompt. */
  openInitiativePrompt: () => void;
  closeInitiativePrompt: () => void;
  /**
   * Sort the tape and begin the fight. When `initiatives` is omitted, blanks
   * are filled from settings.initiativeMode (tests / programmatic start).
   */
  startCombat: (initiatives?: Record<string, number>) => void;
  endCombat: () => void;
  sortByInitiative: () => void;
  /** Mark one live-fight loot line awarded and pin it to session notes. */
  awardLoot: (id: string) => void;
  /** Award every pending loot line on the live fight. */
  awardAllLoot: () => void;
  /** Drop awarded loot from the live canvas. It stays in Notes. */
  clearAwardedLoot: () => void;

  shortRest: () => void;
  longRest: () => void;

  pushLog: (message: string, kind?: LogEntry['kind']) => void;
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
  undoLast: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  addTracker: (tracker: Omit<Tracker, 'id'> & { id?: string }) => void;
  updateTracker: (id: string, patch: Partial<Tracker>) => void;
  removeTracker: (id: string) => void;

  upsertNpc: (npc: NpcRecord) => void;
  deleteNpc: (id: string) => void;
  /** Clone a bestiary/stat block into the campaign roster (defaults writeBackHp on). */
  createNpcFromStatBlock: (
    block: import('./types').StatBlock,
    name?: string,
  ) => string;
  addNpcToCombat: (npcId: string) => void;

  upsertPartyMember: (member: PartyMember) => void;
  deletePartyMember: (id: string) => void;
  upsertSessionNote: (note: SessionNote) => void;
  deleteSessionNote: (id: string) => void;
  createBlankPartyMember: (name?: string) => string;
  /** Sheet-only patch — never writes live combat fields. */
  patchPartySheet: (id: string, patch: PartySheetPatch) => void;
  /** Live HP / slots / focus — never writes sheet fields. */
  patchPartyLive: (id: string, patch: PartyLivePatch) => void;
  /**
   * Damage / heal / temp for a hero. Routes to the linked combatant while
   * they are in the fight; otherwise updates party live HP directly.
   */
  applyPartyHpAdjust: (
    id: string,
    kind: 'damage' | 'heal' | 'temp',
    amount: number,
  ) => void;
  levelUpPartyMember: (id: string, input: LevelUpInput) => void;
  addPartyMemberToCombat: (id: string) => void;
  addWholePartyToCombat: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      campaigns: [],
      activeCampaignId: null,
      encounters: [],
      combatByCampaign: {},
      log: [],
      settings: defaultSettings,
      undoStack: [],
      concentrationPrompt: null,
      initiativePromptOpen: false,
      toasts: [],

      getActiveCombat: () => {
        const { activeCampaignId, combatByCampaign } = get();
        if (!activeCampaignId) return EMPTY_COMBAT;
        return combatByCampaign[activeCampaignId] ?? EMPTY_COMBAT;
      },

      getActiveCampaign: () => {
        const { campaigns, activeCampaignId } = get();
        return campaigns.find((c) => c.id === activeCampaignId) ?? null;
      },

      createCampaign: (name, system = 'dnd5e') => {
        const id = crypto.randomUUID();
        const adapter = getSystemAdapter(system);
        const campaign: Campaign = {
          id,
          name,
          system,
          party: [],
          npcs: [],
          trackers: [],
          notes: '',
          sessionNotes: [],
          lastOpened: Date.now(),
          sessionNumber: 1,
        };
        set((s) => ({
          campaigns: [...s.campaigns, campaign],
          activeCampaignId: id,
          combatByCampaign: {
            ...s.combatByCampaign,
            [id]: emptyCombatState(),
          },
        }));
        get().pushLog(`Created campaign “${name}” (${adapter.label})`, 'system');
        return id;
      },

      updateCampaign: (id, patch) => {
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, ...patch, lastOpened: Date.now() } : c,
          ),
        }));
      },

      changeCampaignSystem: (id, system) => {
        const campaign = get().campaigns.find((c) => c.id === id);
        if (!campaign || campaign.system === system) return;

        const from = getSystemAdapter(campaign.system);
        const to = getSystemAdapter(system);
        const cleared = stripSystemSpecificCampaign(campaign, system);

        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...cleared, lastOpened: Date.now() } : c,
          ),
          combatByCampaign: {
            ...s.combatByCampaign,
            [id]: {
              ...(s.combatByCampaign[id] ?? emptyCombatState()),
              combatants: (s.combatByCampaign[id]?.combatants ?? []).map((comb) =>
                to.clearCombatantResources(from.clearCombatantResources(comb)),
              ),
            },
          },
        }));
        get().pushLog(
          `System changed ${from.label} → ${to.label}. System-specific resources cleared.`,
          'system',
        );
      },

      deleteCampaign: (id) => {
        const wasActive = get().activeCampaignId === id;
        set((s) => {
          const remaining = s.campaigns.filter((c) => c.id !== id);
          const { [id]: _removed, ...restCombat } = s.combatByCampaign;
          void _removed;
          const nextActive = wasActive
            ? remaining
                .slice()
                .sort((a, b) => b.lastOpened - a.lastOpened)[0]?.id ?? null
            : s.activeCampaignId;
          return {
            campaigns: remaining,
            activeCampaignId: nextActive,
            combatByCampaign: restCombat,
            ...(wasActive ? { log: [], undoStack: [] } : {}),
          };
        });
        if (wasActive && get().activeCampaignId) {
          get().syncPartyToTape();
        }
      },

      setActiveCampaign: (id) => {
        set((s) => ({
          activeCampaignId: id,
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, lastOpened: Date.now() } : c,
          ),
          log: [],
          undoStack: [],
        }));
        get().syncPartyToTape();
      },

      upsertEncounter: (encounter) => {
        set((s) => {
          const idx = s.encounters.findIndex((e) => e.id === encounter.id);
          if (idx === -1) return { encounters: [...s.encounters, encounter] };
          const next = [...s.encounters];
          next[idx] = encounter;
          return { encounters: next };
        });
      },

      deleteEncounter: (id) => {
        set((s) => ({ encounters: s.encounters.filter((e) => e.id !== id) }));
      },

      syncPartyToTape: () => {
        const { activeCampaignId, getActiveCampaign, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const campaign = getActiveCampaign();
        if (!campaign) return;
        const { combatants, changed } = applyPartyToCombatants(
          getActiveCombat().combatants,
          campaign.party,
          campaign.system,
        );
        if (!changed) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(
            s.combatByCampaign,
            activeCampaignId,
            { combatants },
          ),
        }));
      },

      clearEncounter: (opts) => {
        const { activeCampaignId, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const campaign = getActiveCampaign();
        const combat = get().getActiveCombat();
        const next = campaign
          ? combatKeepingParty(combat, campaign.party, campaign.system)
          : emptyCombatState();
        set((s) => ({
          combatByCampaign: patchActiveCombat(
            s.combatByCampaign,
            activeCampaignId,
            next,
          ),
          undoStack: [],
          concentrationPrompt: null,
        }));
        if (!opts?.silent) {
          get().pushLog('Encounter cleared (party stays on the tracker)', 'system');
        }
      },

      endSession: () => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        const campaign = getActiveCampaign();
        const session = campaign?.sessionNumber ?? 1;

        if (campaign) {
          const npcResult = applyNpcHpWriteBack(
            campaign.npcs,
            combat.combatants,
            session,
          );
          const partyResult = applyPartyLiveWriteBack(
            campaign.party,
            combat.combatants,
          );
          const adapter = getSystemAdapter(campaign.system);
          const party =
            adapter.resources.kind === 'focus-hero'
              ? partyResult.party.map(resetHeroPointsForSession)
              : partyResult.party;
          const trackers = retainCampaignTrackers(campaign.trackers);
          set((s) => ({
            campaigns: s.campaigns.map((camp) =>
              camp.id === activeCampaignId
                ? {
                    ...camp,
                    npcs: npcResult.npcs,
                    party,
                    trackers,
                    sessionNumber: session + 1,
                  }
                : camp,
            ),
          }));
          for (const msg of npcResult.logs) get().pushLog(msg, 'system');
          for (const msg of partyResult.logs) get().pushLog(msg, 'system');
        }

        const ended = get().getActiveCampaign();
        const nextCombat = ended
          ? combatKeepingParty(combat, ended.party, ended.system)
          : emptyCombatState();
        const resetHero =
          ended && getSystemAdapter(ended.system).resources.kind === 'focus-hero';
        set((s) => ({
          combatByCampaign: patchActiveCombat(
            s.combatByCampaign,
            activeCampaignId,
            resetHero
              ? {
                  ...nextCombat,
                  combatants: nextCombat.combatants.map((c) =>
                    c.kind === 'pc'
                      ? { ...c, heroPoints: HERO_POINT_SESSION_START }
                      : c,
                  ),
                }
              : nextCombat,
          ),
          undoStack: [],
          concentrationPrompt: null,
        }));
        get().pushLog(`Session ${session} ended → session ${session + 1}`, 'system');
      },

      loadEncounter: async (encounter, opts) => {
        const campaign = get().getActiveCampaign();
        const { activeCampaignId, settings } = get();
        if (!campaign || !activeCampaignId) {
          return { ok: false, error: 'No active campaign' };
        }
        if (encounter.system !== campaign.system) {
          return {
            ok: false,
            error: `System mismatch: encounter is ${encounter.system}`,
          };
        }

        const map = opts?.creatureIdMap ?? {};
        const omitC = new Set(opts?.omitCreatures ?? []);
        const omitN = new Set(opts?.omitNpcs ?? []);

        // Resolve everything before touching the tape. A creature that fails to
        // load halfway through used to leave the previous fight wiped and the
        // new one half-built, with no way back.
        const staged: Combatant[] = [];
        for (const entry of encounter.entries) {
          if (omitC.has(entry.creatureId)) continue;
          const resolvedId = map[entry.creatureId] ?? entry.creatureId;
          const block = await getCreatureById(resolvedId);
          if (!block) {
            return {
              ok: false,
              error: `Missing creature “${entry.nameSnapshot}” — resolve dependencies first`,
            };
          }
          staged.push(
            ...buildCombatantsFromStatBlock(block, {
              quantity: entry.quantity,
              hpMode: settings.hpRollMode,
              nameOverride: entry.nameOverride,
              hpOverride: entry.hpOverride,
            }),
          );
        }

        const npcIds = encounter.npcIds.filter((id) => !omitN.has(id));
        const missingNpc = npcIds.find(
          (id) => !campaign.npcs.some((n) => n.id === id),
        );
        if (missingNpc) {
          return {
            ok: false,
            error: 'Encounter references an NPC missing from this campaign — resolve dependencies first',
          };
        }

        // Replace current fight — no silent write-back
        get().clearEncounter({ silent: true });

        const liveLoot = activateLootForCombat(encounter.loot);
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            loot: liveLoot,
            sourceEncounterName: encounter.name,
          }),
        }));

        for (const c of staged) get().addCombatant(c);
        for (const npcId of npcIds) get().addNpcToCombat(npcId);

        // Re-running an encounter must not stack a second copy of its clocks.
        for (const preset of encounter.trackerPresets) {
          const existing = get()
            .getActiveCampaign()
            ?.trackers.find(
              (t) => t.name === preset.name && t.kind === preset.kind,
            );
          if (existing) {
            get().updateTracker(existing.id, {
              ...preset,
              scope: preset.scope ?? 'encounter',
            });
            continue;
          }
          get().addTracker({ ...preset, scope: preset.scope ?? 'encounter' });
        }

        // Encounters are enemy packs — the campaign party is always pulled in
        // so Run = enemies + heroes, never “remember All to combat.”
        const missing = partyMembersNotInCombat(
          campaign.party,
          get().getActiveCombat().combatants,
        );
        for (const m of missing) {
          get().addCombatant(partyMemberToCombatant(m));
        }

        get().upsertEncounter({
          ...encounter,
          timesRun: (encounter.timesRun ?? 0) + 1,
          lastRunAt: Date.now(),
        });

        const partyNote =
          missing.length > 0
            ? ` + ${missing.length} party member${missing.length === 1 ? '' : 's'}`
            : campaign.party.length > 0
              ? ' (party already on the tape)'
              : '';
        get().pushLog(`Loaded encounter “${encounter.name}”${partyNote}`, 'system');
        get().pushToast(
          campaign.party.length === 0
            ? `Loaded “${encounter.name}” — add player characters under Players`
            : liveLoot.length > 0
              ? `Loaded “${encounter.name}” — ${liveLoot.length} loot line${liveLoot.length === 1 ? '' : 's'} ready to award after the fight`
              : `Loaded “${encounter.name}” with your party — Start combat when ready`,
        );
        return { ok: true };
      },

      saveCombatAsEncounter: (name, tags) => {
        const campaign = get().getActiveCampaign();
        const combat = get().getActiveCombat();
        if (!campaign) return null;
        const encounter = encounterFromCombat({
          name: name.trim() || 'Untitled encounter',
          system: campaign.system,
          campaignTags: tags?.length ? tags : [campaign.name],
          combatants: combat.combatants,
          npcs: campaign.npcs,
          trackers: campaign.trackers,
          loot: lootForLibrary(combat.loot),
        });
        get().upsertEncounter(encounter);
        get().pushLog(`Saved encounter “${encounter.name}” to library`, 'system');
        return encounter.id;
      },

      importCampaignJson: (raw) => {
        const parsed = parseCampaignImport(raw);
        if (!parsed.ok) return parsed;
        // parseCampaignImport already re-keyed the campaign, its roster, and any
        // combatants pointing at it — re-rolling ids here would break those links.
        const camp = parsed.payload.campaign;
        set((s) => ({
          campaigns: [...s.campaigns, camp],
          activeCampaignId: camp.id,
          combatByCampaign: {
            ...s.combatByCampaign,
            [camp.id]: parsed.payload.combat ?? emptyCombatState(),
          },
        }));
        get().pushLog(`Imported campaign “${camp.name}”`, 'system');
        get().syncPartyToTape();
        return { ok: true, id: camp.id };
      },

      exportActiveCampaignJson: () => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return null;
        const combat = get().getActiveCombat();
        const linked = get()
          .encounters.filter((e) =>
            e.campaignTags.some(
              (t) => t.toLowerCase() === campaign.name.toLowerCase(),
            ),
          )
          .map((e) => e.id);
        return JSON.stringify(
          exportCampaignPayload(campaign, combat, linked),
          null,
          2,
        );
      },

      addCombatant: (combatant) => {
        const { activeCampaignId, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const campaign = getActiveCampaign();
        const adapter = campaign ? getSystemAdapter(campaign.system) : null;
        const hydrated = {
          ...(adapter?.turnStructure === 'three-action'
            ? {
                ...combatant,
                actionsRemaining: combatant.actionsRemaining ?? 3,
                mapPenalty: combatant.mapPenalty ?? 0,
              }
            : combatant),
        };
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => {
            const incoming = c.started
              ? hydrated
              : { ...hydrated, initiative: null };
            const combatants = c.started
              ? sortCombatants([...c.combatants, incoming])
              : [...c.combatants, incoming];
            return { ...c, combatants };
          }),
        }));
        get().pushLog(`Added ${combatant.name}`, 'system');
      },

      removeCombatant: (id) => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        const removedIndex = combat.combatants.findIndex((c) => c.id === id);
        const target = removedIndex >= 0 ? combat.combatants[removedIndex] : undefined;
        const campaign = getActiveCampaign();
        if (
          target?.sourcePartyMemberId &&
          campaign?.party.some((p) => p.id === target.sourcePartyMemberId)
        ) {
          get().pushToast(
            'Party members stay on the tracker — remove them under Players',
          );
          return;
        }
        set((s) => ({
          concentrationPrompt:
            s.concentrationPrompt?.combatantId === id ? null : s.concentrationPrompt,
          undoStack: s.undoStack.filter((u) => u.combatantId !== id),
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => {
            const combatants = c.combatants.filter((x) => x.id !== id);
            return {
              ...c,
              combatants,
              turnIndex: turnIndexAfterRemove(
                c.combatants.length,
                c.turnIndex,
                removedIndex,
              ),
            };
          }),
        }));
        if (target) get().pushLog(`Removed ${target.name}`, 'system');
      },

      updateCombatant: (id, patch) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          })),
        }));
      },

      applyDamage: (id, amount, opts) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target) return;

        const type = opts?.type?.trim();
        const tier = type ? resistanceTier(target, type) : 'normal';
        const incoming = Math.max(0, Math.floor(amount));
        const dealt = applyResistance(incoming, tier);

        const snapshot: UndoSnapshot = {
          combatantId: id,
          name: target.name,
          hp: target.hp,
          tempHp: target.tempHp,
          deathSaves: { ...target.deathSaves },
          kind: 'damage',
        };
        const next = applyDamagePure(target, dealt);

        // RAW: taking damage forces the save even when temp HP absorbs all of
        // it, and the DC is read off damage dealt rather than HP lost.
        let concentrationPrompt: ConcentrationPrompt | null = get().concentrationPrompt;
        if (target.concentrating && dealt > 0) {
          concentrationPrompt = {
            combatantId: id,
            name: target.name,
            dc: concentrationDC(dealt),
            damage: dealt,
          };
        }

        set((s) => ({
          undoStack: pushUndo(s.undoStack, snapshot),
          concentrationPrompt,
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) => (x.id === id ? { ...x, ...next } : x)),
          })),
        }));
        const typeBit = type ? ` ${type}` : '';
        const tierBit =
          tier === 'normal'
            ? ''
            : tier === 'immune'
              ? ' [immune]'
              : ` [${tier}${incoming !== dealt ? ` ${incoming}→${dealt}` : ''}]`;
        get().pushLog(
          `${target.name} takes ${dealt}${typeBit} damage${tierBit} → ${next.hp}/${target.maxHp}`,
          'damage',
        );
      },

      applyHealing: (id, amount) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target) return;

        const snapshot: UndoSnapshot = {
          combatantId: id,
          name: target.name,
          hp: target.hp,
          tempHp: target.tempHp,
          deathSaves: { ...target.deathSaves },
          kind: 'heal',
        };
        const next = applyHealingPure(target, amount);

        set((s) => ({
          undoStack: pushUndo(s.undoStack, snapshot),
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) => (x.id === id ? { ...x, ...next } : x)),
          })),
        }));
        get().pushLog(
          `${target.name} heals ${Math.floor(amount)} → ${next.hp}/${target.maxHp}`,
          'heal',
        );
      },

      setTempHp: (id, amount) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target) return;

        const snapshot: UndoSnapshot = {
          combatantId: id,
          name: target.name,
          hp: target.hp,
          tempHp: target.tempHp,
          deathSaves: { ...target.deathSaves },
          kind: 'temp',
        };
        const tempHp = setTempHpPure(amount);

        set((s) => ({
          undoStack: pushUndo(s.undoStack, snapshot),
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) => (x.id === id ? { ...x, tempHp } : x)),
          })),
        }));
        get().pushLog(`${target.name} temp HP set to ${tempHp}`, 'heal');
      },

      rollDeathSave: (id) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target || target.kind !== 'pc' || target.hp > 0) return;

        const roll = rollExpression('d20').total;
        const outcome = resolveDeathSave(target.deathSaves, roll);

        if (outcome.kind === 'revive') {
          set((s) => ({
            combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
              ...c,
              combatants: c.combatants.map((x) =>
                x.id === id
                  ? { ...x, hp: 1, deathSaves: { successes: 0, failures: 0 } }
                  : x,
              ),
            })),
          }));
          get().pushLog(`${target.name} death save ${roll} — nat 20, back at 1 HP!`, 'system');
          return;
        }

        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) =>
              x.id === id
                ? {
                    ...x,
                    deathSaves: {
                      successes: outcome.successes,
                      failures: outcome.failures,
                    },
                  }
                : x,
            ),
          })),
        }));
        const label =
          outcome.kind === 'dead'
            ? `death save ${roll} — dead`
            : outcome.kind === 'success'
              ? `death save ${roll} — success (${outcome.successes}/3)`
              : `death save ${roll} — failure (${outcome.failures}/3)`;
        get().pushLog(`${target.name} ${label}`, 'system');
      },

      addLairAction: () => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        const lair = createCombatant({
          name: 'Lair',
          kind: 'lair',
          initiative: null,
          dex: 10,
          ac: 0,
          hp: 1,
          maxHp: 1,
          hidden: false,
        });
        get().addCombatant(lair);
        if (get().getActiveCombat().started) get().sortByInitiative();
      },

      addCondition: (id, condition) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) =>
              x.id === id
                ? { ...x, conditions: [...x.conditions.filter((q) => q.name !== condition.name), condition] }
                : x,
            ),
          })),
        }));
        get().pushLog(`${target.name} gains ${condition.name}`, 'condition');
      },

      removeCondition: (id, name) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const target = getActiveCombat().combatants.find((c) => c.id === id);
        if (!target) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) =>
              x.id === id
                ? { ...x, conditions: x.conditions.filter((q) => q.name !== name) }
                : x,
            ),
          })),
        }));
        get().pushLog(`${target.name}: ${name} removed`, 'condition');
      },

      clearConcentrationPrompt: () => set({ concentrationPrompt: null }),

      rollConcentrationSave: () => {
        const prompt = get().concentrationPrompt;
        if (!prompt) return;
        const target = get().getActiveCombat().combatants.find((c) => c.id === prompt.combatantId);
        if (!target) {
          set({ concentrationPrompt: null });
          return;
        }
        const { roll, total, mod } = rollAbilitySave(target, 'con');
        const success = total >= prompt.dc;
        if (!success) {
          get().updateCombatant(target.id, { concentrating: false });
        }
        get().pushLog(
          `${target.name} concentration DC ${prompt.dc}: ${roll}${mod >= 0 ? `+${mod}` : mod}=${total} — ${success ? 'holds' : 'drops'}`,
          'system',
        );
        set({ concentrationPrompt: null });
      },

      dropConcentration: () => {
        const prompt = get().concentrationPrompt;
        if (!prompt) return;
        get().updateCombatant(prompt.combatantId, { concentrating: false });
        get().pushLog(`${prompt.name} drops concentration`, 'system');
        set({ concentrationPrompt: null });
      },

      nextTurn: () => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        if (!combat.started || combat.combatants.length === 0) return;
        const adapter = getSystemAdapter(getActiveCampaign()?.system ?? 'dnd5e');
        const prevRound = combat.round;
        const { combat: next, logs } = advanceCombatTurn(combat, adapter);
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, next),
        }));
        for (const entry of logs) {
          get().pushLog(entry.message, entry.kind);
        }

        if (next.round > prevRound) {
          const campaign = get().getActiveCampaign();
          if (!campaign) return;
          let trackers = campaign.trackers;
          const allEvents: ReturnType<typeof tickTrackers>['events'] = [];
          const endTick = tickTrackers(trackers, 'round-end');
          trackers = endTick.trackers;
          allEvents.push(...endTick.events);
          const startTick = tickTrackers(trackers, 'round-start');
          trackers = startTick.trackers;
          allEvents.push(...startTick.events);

          if (allEvents.length > 0) {
            set((s) => ({
              campaigns: s.campaigns.map((c) =>
                c.id === activeCampaignId ? { ...c, trackers } : c,
              ),
            }));
            for (const ev of allEvents) {
              get().pushLog(ev.message, 'system');
              if (ev.filled) get().pushToast(ev.message);
            }
          }
        }
      },

      prevTurn: () => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        if (!combat.started || combat.combatants.length === 0) return;

        let turnIndex = combat.turnIndex - 1;
        let round = combat.round;
        if (turnIndex < 0) {
          if (round <= 1) return;
          round -= 1;
          turnIndex = combat.combatants.length - 1;
        }

        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            turnIndex,
            round,
          }),
        }));
        const active = combat.combatants[turnIndex];
        get().pushLog(`Back — Round ${round}, ${active?.name ?? '—'}`, 'turn');
      },

      openInitiativePrompt: () => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        if (getActiveCombat().started) {
          get().pushToast('Combat is already underway');
          return;
        }
        pullMissingParty(get);
        if (get().getActiveCombat().combatants.length === 0) {
          get().pushToast('Add combatants before starting');
          return;
        }
        set({ initiativePromptOpen: true });
      },

      closeInitiativePrompt: () => set({ initiativePromptOpen: false }),

      startCombat: (initiatives) => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const campaign = getActiveCampaign();
        const adapter = getSystemAdapter(campaign?.system ?? 'dnd5e');

        // The party is the permanent baseline — pull in any PC who isn't
        // already on the tape. Dedupe via sourcePartyMemberId.
        pullMissingParty(get);

        const listed = getActiveCombat().combatants;
        const settings = get().settings;
        const withInit = initiatives
          ? applyInitiativeMap(listed, initiatives)
          : fillMissingInitiatives(
              listed,
              settings.initiativeMode,
              adapter,
            );
        const sorted = sortCombatants(withInit);
        const prior = getActiveCombat();
        const { combat, logs } = beginCombat(sorted, adapter, {
          loot: prior.loot ?? [],
          sourceEncounterName: prior.sourceEncounterName,
        });
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, combat),
          initiativePromptOpen: false,
        }));
        for (const entry of logs) {
          get().pushLog(entry.message, entry.kind);
        }
      },

      endCombat: () => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        const campaign = getActiveCampaign();
        const session = campaign?.sessionNumber ?? 1;

        if (campaign) {
          const npcResult = applyNpcHpWriteBack(
            campaign.npcs,
            combat.combatants,
            session,
          );
          const partyResult = applyPartyLiveWriteBack(
            campaign.party,
            combat.combatants,
          );
          const trackers = retainCampaignTrackers(campaign.trackers);

          set((s) => ({
            campaigns: s.campaigns.map((camp) =>
              camp.id === activeCampaignId
                ? {
                    ...camp,
                    npcs: npcResult.npcs,
                    party: partyResult.party,
                    trackers,
                  }
                : camp,
            ),
          }));
          for (const msg of npcResult.logs) get().pushLog(msg, 'system');
          for (const msg of partyResult.logs) get().pushLog(msg, 'system');
        }

        set((s) => ({
          combatByCampaign: patchActiveCombat(
            s.combatByCampaign,
            activeCampaignId,
            campaign
              ? combatKeepingParty(combat, campaign.party, campaign.system)
              : emptyCombatState(),
          ),
          undoStack: [],
          concentrationPrompt: null,
        }));
        get().pushLog('Combat ended', 'system');
      },

      awardLoot: (id) => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        const line = combat.loot.find((l) => l.id === id);
        if (!line || line.awarded || !line.text.trim()) return;
        const campaign = getActiveCampaign();
        const encounterName = combat.sourceEncounterName ?? 'Encounter';
        const nextLoot = markLootAwarded(combat.loot, id);
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            loot: nextLoot,
          }),
        }));
        get().pushLog(formatLootAwardLog(line, encounterName), lootLogKind());
        if (campaign) {
          const note = appendLootToSessionNotes(
            campaign.sessionNotes ?? [],
            campaign.sessionNumber ?? 1,
            encounterName,
            [line],
          );
          get().upsertSessionNote(note);
        }
        get().pushToast(`Awarded: ${line.text.trim()}`);
      },

      awardAllLoot: () => {
        const { activeCampaignId, getActiveCombat, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        const pending = pendingLoot(combat.loot);
        if (pending.length === 0) return;
        const campaign = getActiveCampaign();
        const encounterName = combat.sourceEncounterName ?? 'Encounter';
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            loot: markAllLootAwarded(combat.loot),
          }),
        }));
        for (const line of pending) {
          get().pushLog(formatLootAwardLog(line, encounterName), lootLogKind());
        }
        if (campaign) {
          const note = appendLootToSessionNotes(
            campaign.sessionNotes ?? [],
            campaign.sessionNumber ?? 1,
            encounterName,
            pending,
          );
          get().upsertSessionNote(note);
        }
        get().pushToast(
          pending.length === 1
            ? `Awarded: ${pending[0]!.text.trim()}`
            : `Awarded ${pending.length} loot lines`,
        );
      },

      clearAwardedLoot: () => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const next = stripAwardedLoot(getActiveCombat().loot);
        if (next.length === getActiveCombat().loot.length) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            loot: next,
          }),
        }));
        get().pushLog('Awarded loot cleared from the tracker', 'system');
      },

      sortByInitiative: () => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const combat = getActiveCombat();
        if (!combat.started) return;
        const combatants = sortCombatants(combat.combatants);
        // Re-sorting mid-fight must not hand the turn to whoever floated to the
        // top — follow the combatant whose turn it currently is.
        const activeId = combat.combatants[combat.turnIndex]?.id;
        const turnIndex =
          combat.started && activeId
            ? Math.max(0, combatants.findIndex((c) => c.id === activeId))
            : 0;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, {
            combatants,
            turnIndex,
          }),
        }));
      },

      shortRest: () => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map(shortRestCombatant),
          })),
        }));
        get().pushLog('Short rest — short-rest abilities recharged', 'system');
      },

      longRest: () => {
        const { activeCampaignId, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const adapter = getSystemAdapter(getActiveCampaign()?.system ?? 'dnd5e');
        set((s) => ({
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((comb) => {
              const rested = longRestCombatant(comb);
              if (adapter.downedModel === 'dying-wounded') {
                return { ...rested, dying: 0 };
              }
              return rested;
            }),
          })),
          campaigns: s.campaigns.map((camp) =>
            camp.id === activeCampaignId
              ? {
                  ...camp,
                  party: camp.party.map(longRestPartyMember),
                }
              : camp,
          ),
        }));
        get().pushLog('Long rest — HP, slots, and daily resources restored', 'system');
      },

      pushLog: (message, kind = 'info') => {
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          at: Date.now(),
          message,
          kind,
        };
        set((s) => ({ log: [...s.log, entry].slice(-200) }));
      },

      pushToast: (message) => {
        const id = crypto.randomUUID();
        set((s) => ({
          toasts: [...s.toasts, { id, message, at: Date.now() }].slice(-5),
        }));
        window.setTimeout(() => get().dismissToast(id), 5000);
      },

      dismissToast: (id) => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },

      undoLast: () => {
        const { activeCampaignId, undoStack, getActiveCombat } = get();
        if (!activeCampaignId || undoStack.length === 0) return;
        const snapshot = undoStack[undoStack.length - 1]!;
        const target = getActiveCombat().combatants.find(
          (c) => c.id === snapshot.combatantId,
        );
        if (!target) {
          set((s) => ({ undoStack: s.undoStack.slice(0, -1) }));
          return;
        }
        set((s) => ({
          undoStack: s.undoStack.slice(0, -1),
          // Damage that opened a concentration check is no longer the live state.
          concentrationPrompt:
            s.concentrationPrompt?.combatantId === snapshot.combatantId
              ? null
              : s.concentrationPrompt,
          combatByCampaign: patchActiveCombat(s.combatByCampaign, activeCampaignId, (c) => ({
            ...c,
            combatants: c.combatants.map((x) =>
              x.id === snapshot.combatantId
                ? {
                    ...x,
                    hp: snapshot.hp,
                    tempHp: snapshot.tempHp,
                    deathSaves: snapshot.deathSaves,
                  }
                : x,
            ),
          })),
        }));
        get().pushLog(`Undo ${snapshot.kind} on ${snapshot.name}`, 'system');
        get().pushToast(`Undid ${snapshot.kind} on ${snapshot.name}`);
      },

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      addTracker: (tracker) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        const record: Tracker = {
          ...tracker,
          id: tracker.id ?? crypto.randomUUID(),
        };
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? { ...c, trackers: [...c.trackers, record] }
              : c,
          ),
        }));
        get().pushLog(
          record.kind === 'clock'
            ? `Clock “${record.name}” (${record.max} segments)`
            : `Counter “${record.name}”`,
          'system',
        );
      },

      updateTracker: (id, patch) => {
        const { activeCampaignId, getActiveCampaign } = get();
        if (!activeCampaignId) return;
        const prev = getActiveCampaign()?.trackers.find((t) => t.id === id);
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? {
                  ...c,
                  trackers: c.trackers.map((t) =>
                    t.id === id ? { ...t, ...patch } : t,
                  ),
                }
              : c,
          ),
        }));
        const next = get().getActiveCampaign()?.trackers.find((t) => t.id === id);
        if (
          prev &&
          next &&
          next.kind === 'clock' &&
          next.max != null &&
          next.value >= next.max &&
          prev.value < next.max
        ) {
          const msg = `Clock “${next.name}” is full (${next.value}/${next.max})`;
          get().pushLog(msg, 'system');
          get().pushToast(msg);
        }
      },

      removeTracker: (id) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? { ...c, trackers: c.trackers.filter((t) => t.id !== id) }
              : c,
          ),
        }));
      },

      upsertNpc: (npc) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          campaigns: s.campaigns.map((c) => {
            if (c.id !== activeCampaignId) return c;
            const idx = c.npcs.findIndex((n) => n.id === npc.id);
            if (idx === -1) return { ...c, npcs: [...c.npcs, npc] };
            const npcs = [...c.npcs];
            npcs[idx] = npc;
            return { ...c, npcs };
          }),
        }));
        const linked = get()
          .getActiveCombat()
          .combatants.filter((c) => c.sourceNpcId === npc.id && c.name !== npc.name);
        for (const c of linked) {
          get().updateCombatant(c.id, { name: npc.name });
        }
      },

      deleteNpc: (id) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const linked = getActiveCombat().combatants.filter(
          (c) => c.sourceNpcId === id,
        );
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? { ...c, npcs: c.npcs.filter((n) => n.id !== id) }
              : c,
          ),
        }));
        for (const c of linked) get().removeCombatant(c.id);
        get().pushLog('Deleted NPC', 'system');
      },

      createNpcFromStatBlock: (block, name) => {
        const npc = npcFromStatBlock(block, {
          name,
          writeBackHp: true,
        });
        get().upsertNpc(npc);
        get().pushLog(`NPC “${npc.name}” added to roster`, 'system');
        return npc.id;
      },

      addNpcToCombat: (npcId) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const npc = campaign.npcs.find((n) => n.id === npcId);
        if (!npc) return;

        if (npc.kind === 'statted' && npc.statBlock) {
          const block = {
            ...npc.statBlock,
            name: npc.name,
            ac: npc.statBlock.ac,
            hpAvg: npc.persistentHp?.max ?? npc.statBlock.hpAvg,
          };
          const [combatant] = buildCombatantsFromStatBlock(block, {
            quantity: 1,
            hpMode: 'average',
            nameOverride: npc.name,
            hpOverride: npc.persistentHp?.current ?? block.hpAvg,
          });
          if (!combatant) return;
          combatant.sourceNpcId = npc.id;
          combatant.ac = npc.statBlock.ac;
          get().addCombatant(combatant);
          return;
        }

        // Character NPC — minimal combatant shell
        const hp = npc.persistentHp?.current ?? npc.persistentHp?.max ?? 10;
        const maxHp = npc.persistentHp?.max ?? hp;
        get().addCombatant(
          createCombatant({
            name: npc.name,
            kind: 'npc',
            sourceNpcId: npc.id,
            hp,
            maxHp,
            ac: 10,
            initiative: null,
          }),
        );
      },

      upsertPartyMember: (member) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        const withCampaign = { ...member, campaignId: activeCampaignId };
        set((s) => ({
          campaigns: s.campaigns.map((c) => {
            if (c.id !== activeCampaignId) return c;
            const idx = c.party.findIndex((p) => p.id === withCampaign.id);
            if (idx === -1) return { ...c, party: [...c.party, withCampaign] };
            const party = [...c.party];
            party[idx] = withCampaign;
            return { ...c, party };
          }),
        }));
        get().syncPartyToTape();
      },

      deletePartyMember: (id) => {
        const { activeCampaignId, getActiveCombat } = get();
        if (!activeCampaignId) return;
        const linked = getActiveCombat().combatants.filter(
          (c) => c.sourcePartyMemberId === id,
        );
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? { ...c, party: c.party.filter((p) => p.id !== id) }
              : c,
          ),
        }));
        for (const c of linked) get().removeCombatant(c.id);
        get().pushLog('Removed party member', 'system');
      },

      upsertSessionNote: (note) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          campaigns: s.campaigns.map((c) => {
            if (c.id !== activeCampaignId) return c;
            const notes = c.sessionNotes ?? [];
            const idx = notes.findIndex((n) => n.id === note.id);
            const sessionNotes =
              idx >= 0
                ? notes.map((n, i) => (i === idx ? note : n))
                : [...notes, note];
            return { ...c, sessionNotes };
          }),
        }));
      },

      deleteSessionNote: (id) => {
        const { activeCampaignId } = get();
        if (!activeCampaignId) return;
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === activeCampaignId
              ? {
                  ...c,
                  sessionNotes: (c.sessionNotes ?? []).filter((n) => n.id !== id),
                }
              : c,
          ),
        }));
      },

      createBlankPartyMember: (name) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return '';
        const member = blankPartyMember(campaign.id, {
          name,
          system: campaign.system,
        });
        get().upsertPartyMember(member);
        get().pushLog(`Added ${member.name} to party`, 'system');
        return member.id;
      },

      patchPartySheet: (id, patch) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const member = campaign.party.find((p) => p.id === id);
        if (!member) return;
        get().upsertPartyMember(applySheetPatch(member, patch));
      },

      patchPartyLive: (id, patch) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const member = campaign.party.find((p) => p.id === id);
        if (!member) return;
        const linked = combatantLinkedToParty(
          id,
          get().getActiveCombat().combatants,
        );
        if (
          linked &&
          (patch.currentHp !== undefined ||
            patch.tempHp !== undefined ||
            patch.heroPoints !== undefined)
        ) {
          get().updateCombatant(linked.id, {
            ...(patch.currentHp !== undefined
              ? {
                  hp: Math.max(
                    0,
                    Math.min(linked.maxHp, Math.floor(patch.currentHp)),
                  ),
                }
              : {}),
            ...(patch.tempHp !== undefined
              ? { tempHp: Math.max(0, Math.floor(patch.tempHp)) }
              : {}),
            ...(patch.heroPoints !== undefined
              ? { heroPoints: clampHeroPoints(patch.heroPoints) }
              : {}),
          });
          const rest: PartyLivePatch = { ...patch };
          delete rest.currentHp;
          delete rest.tempHp;
          if (
            rest.spellSlotsUsed !== undefined ||
            rest.focusPointsCurrent !== undefined ||
            rest.heroPoints !== undefined
          ) {
            get().upsertPartyMember(applyLivePatch(member, rest));
          }
          return;
        }
        get().upsertPartyMember(applyLivePatch(member, patch));
      },

      applyPartyHpAdjust: (id, kind, amount) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const member = campaign.party.find((p) => p.id === id);
        if (!member) return;
        const linked = combatantLinkedToParty(
          id,
          get().getActiveCombat().combatants,
        );
        if (linked) {
          if (kind === 'damage') get().applyDamage(linked.id, amount);
          else if (kind === 'heal') get().applyHealing(linked.id, amount);
          else get().setTempHp(linked.id, amount);
          return;
        }
        const next = adjustPartyLiveHp(member, kind, amount);
        get().upsertPartyMember(next);
        if (kind === 'damage') {
          get().pushLog(
            `${member.name} takes ${Math.floor(amount)} damage → ${next.currentHp}/${next.maxHp}`,
            'damage',
          );
        } else if (kind === 'heal') {
          get().pushLog(
            `${member.name} heals ${Math.floor(amount)} → ${next.currentHp}/${next.maxHp}`,
            'heal',
          );
        } else {
          get().pushLog(
            `${member.name} temp HP set to ${next.tempHp}`,
            'heal',
          );
        }
      },

      levelUpPartyMember: (id, input) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const member = campaign.party.find((p) => p.id === id);
        if (!member) return;
        const { member: next, proficiencyBonus, suggestSpellSlotUpdate } =
          applyLevelUp(member, input);
        get().upsertPartyMember(next);
        get().pushLog(
          `${next.name} → level ${next.level}` +
            ` (PB +${proficiencyBonus}` +
            (suggestSpellSlotUpdate ? '; update spell slots?' : '') +
            ')',
          'system',
        );
      },

      addPartyMemberToCombat: (id) => {
        const campaign = get().getActiveCampaign();
        if (!campaign) return;
        const member = campaign.party.find((p) => p.id === id);
        if (!member) return;
        if (isPartyMemberInCombat(id, get().getActiveCombat().combatants)) {
          get().pushToast(`${member.name} is already in combat`);
          return;
        }
        get().addCombatant(partyMemberToCombatant(member));
      },

      addWholePartyToCombat: () => {
        const campaign = get().getActiveCampaign();
        if (!campaign || campaign.party.length === 0) return;
        const before = get().getActiveCombat().combatants.length;
        get().syncPartyToTape();
        const after = get().getActiveCombat().combatants.length;
        if (after === before) {
          get().pushToast('Whole party is already on the tracker');
          return;
        }
        get().pushLog(
          `Added ${after - before} party member${after - before === 1 ? '' : 's'} to the tracker`,
          'system',
        );
      },
    }),
    {
      name: 'initiative-table',
      partialize: (state) => ({
        campaigns: state.campaigns,
        activeCampaignId: state.activeCampaignId,
        encounters: state.encounters,
        combatByCampaign: state.combatByCampaign,
        settings: state.settings,
        undoStack: state.undoStack,
      }),
      merge: (persisted, current) => mergePersistedState(persisted, current),
    },
  ),
);

export function applyPersistSlice(slice: PersistSlice): void {
  const merged = mergePersistedState(slice, useStore.getState());
  useStore.setState({
    campaigns: merged.campaigns,
    activeCampaignId: merged.activeCampaignId,
    encounters: merged.encounters,
    combatByCampaign: merged.combatByCampaign,
    settings: merged.settings,
    undoStack: [],
    log: [],
    toasts: [],
    concentrationPrompt: null,
    initiativePromptOpen: false,
  });
}

export function waitForPersistHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.persist.onFinishHydration(() => {
      if (timer != null) clearTimeout(timer);
      unsub();
      resolve();
    });
    // Hydration can finish between the hasHydrated() check and the subscribe.
    if (useStore.persist.hasHydrated()) {
      unsub();
      resolve();
      return;
    }
    timer = setTimeout(() => {
      unsub();
      resolve();
    }, 4000);
  });
}

/**
 * Reference-stable selectors for components.
 * Always prefer these over inline selectors that build objects or arrays.
 */
export const selectActiveCampaign = (s: AppState): Campaign | null =>
  s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null;

export const selectActiveCombat = (s: AppState): CombatState =>
  s.activeCampaignId
    ? (s.combatByCampaign[s.activeCampaignId] ?? EMPTY_COMBAT)
    : EMPTY_COMBAT;

export const selectActiveCombatants = (s: AppState): Combatant[] =>
  selectActiveCombat(s).combatants;

export const selectActiveTrackers = (s: AppState): Tracker[] =>
  selectActiveCampaign(s)?.trackers ?? EMPTY_TRACKERS;
