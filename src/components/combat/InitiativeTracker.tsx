import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSystemAdapter } from '../../systems';
import {
  selectActiveCampaign,
  selectActiveCombat,
  useStore,
} from '../../store';
import { assignIdentityHues, hueHex } from '../../lib/identity';
import { downloadText, sessionLogToMarkdown } from '../../lib/session-log';
import { pendingLoot } from '../../lib/loot';
import { resolveDamageExpr } from '../../lib/dice';
import { resolveHpField } from '../../lib/combat';
import { resolveCombatantPortrait } from '../../lib/portrait';
import { spendActionsRemaining, type ActionCost } from '../../lib/pf2e-actions';
import type { Entry } from '../../types';
import { EncounterLibrary } from '../EncounterLibrary';
import { BloomCluster } from '../ornament/Botanical';
import { BulkSaveDialog } from './BulkSaveDialog';
import { CombatantInspect } from './CombatantInspect';
import { CombatantRow } from './CombatantRow';
import { CombatLootPanel } from './CombatLootPanel';
import { ConcentrationBanner } from './ConcentrationBanner';
import { DamageTypeSelect } from './DamageTypeSelect';
import { InitiativePrompt } from './InitiativePrompt';
import { ConditionDialog } from '../ui/AskDialog';
import { Modal } from '../ui/Modal';

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space / →', action: 'Next turn' },
  { keys: '←', action: 'Previous turn' },
  { keys: 'j / k', action: 'Move keyboard focus (does not check boxes)' },
  { keys: 'i / Enter', action: 'Open stats for focused combatant' },
  { keys: 'd / h', action: 'Focus HP field (selection bar if boxed)' },
  { keys: 's', action: 'Bulk save (when selected)' },
  { keys: '/', action: 'Search creatures (opens Library)' },
  { keys: 'Ctrl+K', action: 'Command palette' },
  { keys: 'Ctrl+K → clear', action: 'Clear encounter (party stays)' },
  { keys: 'Ctrl+Z', action: 'Undo HP change (stack, up to 20)' },
  { keys: '?', action: 'This cheat sheet' },
];

export function InitiativeTracker({
  onFocusSearch,
  onOpenBestiary,
}: {
  onFocusSearch?: () => void;
  onOpenBestiary?: () => void;
}) {
  const combat = useStore(selectActiveCombat);
  const campaign = useStore(selectActiveCampaign);
  const settings = useStore((s) => s.settings);
  const hasCampaign = useStore((s) => s.activeCampaignId !== null);

  const startCombat = useStore((s) => s.startCombat);
  const openInitiativePrompt = useStore((s) => s.openInitiativePrompt);
  const closeInitiativePrompt = useStore((s) => s.closeInitiativePrompt);
  const initiativePromptOpen = useStore((s) => s.initiativePromptOpen);
  const endCombat = useStore((s) => s.endCombat);
  const awardAllLoot = useStore((s) => s.awardAllLoot);
  const clearEncounter = useStore((s) => s.clearEncounter);
  const endSession = useStore((s) => s.endSession);
  const nextTurn = useStore((s) => s.nextTurn);
  const prevTurn = useStore((s) => s.prevTurn);
  const sortByInitiative = useStore((s) => s.sortByInitiative);
  const updateCombatant = useStore((s) => s.updateCombatant);
  const applyDamage = useStore((s) => s.applyDamage);
  const applyHealing = useStore((s) => s.applyHealing);
  const setTempHp = useStore((s) => s.setTempHp);
  const removeCombatant = useStore((s) => s.removeCombatant);
  const rollDeathSave = useStore((s) => s.rollDeathSave);
  const addLairAction = useStore((s) => s.addLairAction);
  const addCondition = useStore((s) => s.addCondition);
  const removeCondition = useStore((s) => s.removeCondition);
  const undoLast = useStore((s) => s.undoLast);
  const updateSettings = useStore((s) => s.updateSettings);
  const pushToast = useStore((s) => s.pushToast);
  const pushLog = useStore((s) => s.pushLog);
  const log = useStore((s) => s.log);

  const adapter = getSystemAdapter(campaign?.system ?? 'dnd5e');
  const form = adapter.statBlockForm;
  const sharedScreen = settings.sharedScreen;
  const partyCount = campaign?.party.length ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDmg, setBulkDmg] = useState('');
  const [damageType, setDamageType] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [statBlockId, setStatBlockId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [flashes, setFlashes] = useState<Map<string, { type?: string; n: number }>>(
    () => new Map(),
  );
  const [pulseTurn, setPulseTurn] = useState(false);
  const [conditionForId, setConditionForId] = useState<string | null>(null);
  /** Pending clear / end that needs a loot decision first. */
  const [lootExit, setLootExit] = useState<
    'end-fight' | 'clear' | 'end-session' | null
  >(null);
  /** Remember DM Hide-HP preference while shared screen forces it on. */
  const hideHpBeforeShared = useRef(settings.hideHpByDefault);
  const damageRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const bulkDmgRef = useRef<HTMLInputElement>(null);
  const selectAnchorRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const moreRef = useRef<HTMLDivElement>(null);
  const [markerTop, setMarkerTop] = useState(0);
  const prevTurnIndex = useRef(combat.turnIndex);

  const runCombatExit = (action: 'end-fight' | 'clear' | 'end-session') => {
    if (action === 'end-fight') endCombat();
    else if (action === 'clear') clearEncounter();
    else endSession();
  };

  const requestCombatExit = (action: 'end-fight' | 'clear' | 'end-session') => {
    if (pendingLoot(combat.loot).length > 0) {
      setLootExit(action);
      return;
    }
    runCombatExit(action);
  };

  const toggleShared = () => {
    const next = !settings.sharedScreen;
    if (next) {
      hideHpBeforeShared.current = settings.hideHpByDefault;
      updateSettings({ sharedScreen: true, hideHpByDefault: true });
    } else {
      updateSettings({
        sharedScreen: false,
        hideHpByDefault: hideHpBeforeShared.current,
      });
    }
  };

  const activeCombatant = combat.started
    ? combat.combatants[combat.turnIndex]
    : undefined;
  const activeId = activeCombatant?.id;
  const selectedCombatants = useMemo(
    () => combat.combatants.filter((c) => selectedIds.has(c.id)),
    [combat.combatants, selectedIds],
  );
  const focusedId = combat.combatants[focusIndex]?.id ?? activeId;

  const updateMarker = useCallback(() => {
    if (!activeId || !listRef.current) {
      setMarkerTop(0);
      return;
    }
    const row = rowRefs.current.get(activeId);
    if (!row) return;
    const listBox = listRef.current.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    setMarkerTop(
      rowBox.top - listBox.top + listRef.current.scrollTop + rowBox.height / 2 - 6,
    );
  }, [activeId]);

  useEffect(() => {
    updateMarker();
  }, [updateMarker, combat.turnIndex, combat.combatants.length]);

  useEffect(() => {
    if (prevTurnIndex.current !== combat.turnIndex) {
      prevTurnIndex.current = combat.turnIndex;
      setPulseTurn(true);
      const id = combat.combatants[combat.turnIndex]?.id;
      if (id) {
        rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const t = window.setTimeout(() => setPulseTurn(false), 500);
      return () => window.clearTimeout(t);
    }
  }, [combat.turnIndex, combat.combatants]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const flashSeq = useRef(0);
  const pulseRow = useCallback((id: string, type?: string) => {
    const n = ++flashSeq.current;
    setFlashes((prev) => {
      const next = new Map(prev);
      next.set(id, { type, n });
      return next;
    });
    window.setTimeout(() => {
      setFlashes((cur) => {
        if (cur.get(id)?.n !== n) return cur;
        const copy = new Map(cur);
        copy.delete(id);
        return copy;
      });
    }, 560);
  }, []);

  const flashDamage = (id: string, n: number, type?: string) => {
    applyDamage(id, n, type ? { type } : undefined);
    pulseRow(id, type);
  };

  const flashHeal = (id: string, n: number) => {
    applyHealing(id, n);
    pulseRow(id, 'heal');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyHpToIds = (ids: string[], raw: string, heal: boolean) => {
    const parsed = resolveHpField(raw);
    if (!parsed || ids.length === 0) return false;
    const kind =
      parsed.kind === 'temp'
        ? 'temp'
        : heal || parsed.kind === 'heal'
          ? 'heal'
          : 'damage';
    const type = parsed.type || damageType || undefined;
    for (const id of ids) {
      if (kind === 'temp') setTempHp(id, parsed.amount);
      else if (kind === 'heal') flashHeal(id, parsed.amount);
      else flashDamage(id, parsed.amount, type);
    }
    if (parsed.detail) pushToast(parsed.detail);
    return true;
  };

  useEffect(() => {
    const live = new Set(combat.combatants.map((c) => c.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [combat.combatants]);

  const applyCombatAction = useCallback(
    (actorId: string, entry: Entry, cost: ActionCost) => {
      const actor = combat.combatants.find((c) => c.id === actorId);
      if (!actor) return;

      if (form.showPf2eBlock) {
        if (cost === 'reaction') {
          updateCombatant(actorId, { reactionUsed: true });
        } else if (cost !== 'free') {
          updateCombatant(actorId, {
            actionsRemaining: spendActionsRemaining(
              actor.actionsRemaining,
              cost,
            ),
          });
        }
      }

      const expr = entry.damage?.expr?.trim();
      if (!expr) {
        pushLog(`${actor.name} uses ${entry.name}`, 'info');
        return;
      }

      let rolled;
      try {
        rolled = resolveDamageExpr(expr);
      } catch {
        pushToast(`Could not roll damage “${expr}”`);
        return;
      }

      const typeLabel = entry.damage?.type?.trim() || 'damage';
      let targets = [...selectedIds].filter((id) => id !== actorId);
      if (targets.length === 0 && focusedId && focusedId !== actorId) {
        targets = [focusedId];
      }

      if (targets.length === 0) {
        pushLog(
          `${actor.name} ${entry.name}: ${rolled.total} ${typeLabel} rolled, no target selected (${rolled.detail})`,
          'info',
        );
        pushToast(
          `${entry.name}: ${rolled.total} ${typeLabel} — select or focus a target`,
        );
        return;
      }

      const type = entry.damage?.type?.trim() || undefined;
      for (const id of targets) {
        applyDamage(id, rolled.total, type ? { type } : undefined);
        pulseRow(id, type);
      }
      const names = combat.combatants
        .filter((c) => targets.includes(c.id))
        .map((c) => c.name)
        .join(', ');
      pushLog(
        `${actor.name} ${entry.name} → ${names}: ${rolled.total} ${typeLabel} (${rolled.detail})`,
        'damage',
      );
    },
    [
      combat.combatants,
      form.showPf2eBlock,
      selectedIds,
      focusedId,
      updateCombatant,
      pushLog,
      pushToast,
      applyDamage,
      pulseRow,
    ],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.key === 'Escape') {
        setBulkOpen(false);
        setStatBlockId(null);
        setModalOpen(false);
        setLibraryOpen(false);
        setMoreOpen(false);
        setHelpOpen(false);
        return;
      }

      if (typing) return;

      if (initiativePromptOpen || helpOpen || lootExit || libraryOpen || bulkOpen) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast();
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        nextTurn();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevTurn();
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setFocusIndex((i) =>
          combat.combatants.length === 0
            ? 0
            : Math.min(combat.combatants.length - 1, i + 1),
        );
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (
        (e.key.toLowerCase() === 'i' || e.key === 'Enter') &&
        focusedId &&
        !sharedScreen
      ) {
        e.preventDefault();
        setStatBlockId(focusedId);
        setModalOpen(true);
      } else if (
        (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'h') &&
        !sharedScreen
      ) {
        e.preventDefault();
        if (selectedIds.size > 0) bulkDmgRef.current?.focus();
        else if (focusedId) damageRefs.current.get(focusedId)?.focus();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (selectedIds.size > 0) setBulkOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        onOpenBestiary?.();
        onFocusSearch?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    focusedId,
    nextTurn,
    prevTurn,
    undoLast,
    selectedIds.size,
    onFocusSearch,
    onOpenBestiary,
    combat.combatants.length,
    sharedScreen,
    pushToast,
    initiativePromptOpen,
    helpOpen,
    lootExit,
    libraryOpen,
    bulkOpen,
  ]);

  const promptCondition = (id: string) => {
    setConditionForId(id);
  };

  const exportLog = () => {
    const md = sessionLogToMarkdown(log, {
      campaignName: campaign?.name,
      sessionNumber: campaign?.sessionNumber,
    });
    downloadText(
      `${campaign?.name ?? 'session'}-s${campaign?.sessionNumber ?? 1}.md`,
      md,
      'text/markdown',
    );
  };

  const identityHues = useMemo(
    () => assignIdentityHues(combat.combatants),
    [combat.combatants],
  );

  // Keep keyboard focus on a real row after Sort / Remove reshuffles the tape.
  useEffect(() => {
    setFocusIndex((i) => {
      if (combat.combatants.length === 0) return 0;
      return Math.min(i, combat.combatants.length - 1);
    });
  }, [combat.combatants]);

  const statBlockTarget = combat.combatants.find((c) => c.id === statBlockId);
  const canStart =
    hasCampaign && (combat.combatants.length > 0 || partyCount > 0);
  const canClearCanvas =
    hasCampaign &&
    (combat.started ||
      combat.loot.length > 0 ||
      combat.combatants.some((c) => !c.sourcePartyMemberId));

  const emptyHint =
    'Add player characters under Players — they stay on this canvas so you can track HP between fights. Then press / to search creatures.';

  return (
    <main className="stage-canopy stage-parchment flex min-h-0 min-w-0 flex-col">
      <div className="header-vine flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-panel/60 px-2 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="font-mono-stats text-2xl font-bold tabular-nums text-text">
            <span className="text-muted">R</span>
            {combat.round}
          </div>
          <div className="flex flex-col leading-tight">
            <span
              className={`text-xs font-semibold ${
                combat.started ? 'text-heal' : 'text-muted'
              }`}
            >
              {combat.started ? 'In combat' : 'Idle'}
            </span>
            <span className="text-[11px] text-muted">
              {combat.combatants.length} combatants
              {form.showPf2eBlock && activeCombatant
                ? ` · ▸${activeCombatant.actionsRemaining ?? 3} MAP ${activeCombatant.mapPenalty ?? 0}`
                : ''}
            </span>
          </div>
        </div>

        {activeCombatant && (
          <div className="chip max-w-[14rem] gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="truncate text-text">{activeCombatant.name}</span>
            <span className="shrink-0 text-muted">to act</span>
          </div>
        )}

        <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
          <button
            type="button"
            disabled={!hasCampaign}
            className="btn btn-accent"
            onClick={() => setLibraryOpen(true)}
            title="Build enemy packs and run them with your party"
          >
            Library
          </button>
          <button
            type="button"
            className={`btn ${sharedScreen ? 'btn-on' : ''}`}
            onClick={toggleShared}
            title="Hide side panels, enlarge names, band HP for the table"
          >
            <span className="sm:hidden">Shared</span>
            <span className="hidden sm:inline">Shared screen</span>
          </button>

          {!sharedScreen && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                className="btn"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((v) => !v)}
              >
                More ▾
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="card absolute right-0 z-40 mt-1 min-w-[11rem] p-1 shadow-2xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={log.length === 0}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      exportLog();
                      setMoreOpen(false);
                    }}
                  >
                    Export log
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasCampaign}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      addLairAction();
                      setMoreOpen(false);
                    }}
                  >
                    + Lair
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={selectedIds.size === 0}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      setBulkOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    Bulk save
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasCampaign || !combat.started}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      sortByInitiative();
                      setMoreOpen(false);
                    }}
                  >
                    Sort
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canClearCanvas}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      requestCombatExit('clear');
                      setMoreOpen(false);
                    }}
                  >
                    Clear encounter
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasCampaign}
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      requestCombatExit('end-session');
                      setMoreOpen(false);
                    }}
                  >
                    End session
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="btn btn-ghost w-full justify-start"
                    onClick={() => {
                      setHelpOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    Shortcuts (?)
                  </button>
                </div>
              )}
            </div>
          )}

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          <button
            type="button"
            disabled={!hasCampaign}
            className="btn"
            onClick={prevTurn}
            title="Previous turn (←)"
          >
            ‹ Back
          </button>
          {combat.started ? (
            <button
              type="button"
              disabled={!hasCampaign}
              className="btn btn-primary"
              onClick={nextTurn}
              title="Next turn (Space)"
            >
              Next ›
            </button>
          ) : (
            <button
              type="button"
              disabled={!canStart}
              className="btn btn-primary"
              onClick={openInitiativePrompt}
              title={
                partyCount > 0
                  ? 'Pulls in any missing party members, then asks for initiative'
                  : 'Enter initiative, then start combat'
              }
            >
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Start combat</span>
            </button>
          )}

          <button
            type="button"
            disabled={!hasCampaign || !combat.started}
            className="btn btn-ghost"
            onClick={() => requestCombatExit('end-fight')}
            title="Stop the round clock. Party stays; enemies leave."
          >
            <span className="sm:hidden">End</span>
            <span className="hidden sm:inline">End fight</span>
          </button>
          <button
            type="button"
            disabled={!canClearCanvas}
            className="btn"
            onClick={() => requestCombatExit('clear')}
            title="Remove enemies, loot, and turn order. Party stays on the tracker."
          >
            Clear
          </button>
        </div>
      </div>

      {!sharedScreen && <ConcentrationBanner />}
      <CombatLootPanel sharedScreen={sharedScreen} />

      <div className="parchment-roll parchment-roll-top" aria-hidden />

      <div ref={listRef} className="relative min-h-0 flex-1 overflow-auto">
        {combat.started && combat.combatants.length > 0 && (
          <div
            className="turn-marker pointer-events-none absolute left-0 z-10 h-3 w-1 rounded-r bg-accent"
            style={{ top: markerTop }}
            aria-hidden
          />
        )}

        {combat.combatants.length === 0 ? (
          <div className="stage-bloom flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <BloomCluster size={132} />
            <div className="text-sm font-medium text-text">No encounter yet</div>
            <p className="max-w-sm text-xs leading-relaxed text-muted">{emptyHint}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  onOpenBestiary?.();
                  onFocusSearch?.();
                }}
              >
                Add creatures
              </button>
              <button
                type="button"
                className="btn"
                disabled={!hasCampaign}
                onClick={() => setLibraryOpen(true)}
              >
                Encounter Library
              </button>
            </div>
          </div>
        ) : (
          combat.combatants.map((c, index) => (
            <div
              key={c.id}
              ref={(el) => {
                if (el) rowRefs.current.set(c.id, el);
                else rowRefs.current.delete(c.id);
              }}
            >
              <CombatantRow
                combatant={c}
                hue={hueHex(identityHues.get(c.id))}
                portraitUrl={resolveCombatantPortrait(c, campaign)}
                active={combat.started && index === combat.turnIndex}
                selected={selectedIds.has(c.id)}
                focused={focusIndex === index}
                form={form}
                hideHp={
                  settings.hideHpByDefault || settings.sharedScreen || c.hidden
                }
                showInitiative={combat.started}
                sharedScreen={sharedScreen}
                flash={flashes.get(c.id)}
                turnPulse={pulseTurn}
                damageInputRef={(el) => {
                  if (el) damageRefs.current.set(c.id, el);
                  else damageRefs.current.delete(c.id);
                }}
                damageType={damageType}
                onDamageTypeChange={setDamageType}
                onSelect={(e) => {
                  if (e.shiftKey) {
                    const from = Math.min(selectAnchorRef.current, index);
                    const to = Math.max(selectAnchorRef.current, index);
                    setSelectedIds(
                      new Set(
                        combat.combatants.slice(from, to + 1).map((row) => row.id),
                      ),
                    );
                    setFocusIndex(index);
                    return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                    toggleSelected(c.id);
                    setFocusIndex(index);
                    selectAnchorRef.current = index;
                    return;
                  }
                  setFocusIndex(index);
                  selectAnchorRef.current = index;
                }}
                onToggleSelect={() => {
                  toggleSelected(c.id);
                  setFocusIndex(index);
                  selectAnchorRef.current = index;
                }}
                onUpdate={(patch) => updateCombatant(c.id, patch)}
                onDamage={(n, detail, type) => {
                  flashDamage(c.id, n, type);
                  if (detail) pushToast(detail);
                }}
                onHeal={(n) => flashHeal(c.id, n)}
                onTemp={(n) => setTempHp(c.id, n)}
                onOpenStatBlock={() => {
                  setStatBlockId(c.id);
                  setModalOpen(true);
                }}
                onDeathSave={() => rollDeathSave(c.id)}
                onAddCondition={() => promptCondition(c.id)}
                onRemoveCondition={(name) => removeCondition(c.id, name)}
                onUseAction={(entry, cost) => applyCombatAction(c.id, entry, cost)}
              />
            </div>
          ))
        )}
      </div>

      <div className="parchment-roll parchment-roll-bottom" aria-hidden />

      {selectedIds.size > 0 && !sharedScreen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-panel/60 px-4 py-2 text-xs">
          <span className="badge-soft badge-accent">
            {selectedIds.size} selected
          </span>
          <input
            ref={bulkDmgRef}
            className="field w-28 py-0.5 font-mono-stats text-sm tabular-nums"
            placeholder="12 · +8 · 8d6"
            value={bulkDmg}
            onChange={(e) => setBulkDmg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (applyHpToIds([...selectedIds], bulkDmg, e.shiftKey)) {
                  setBulkDmg('');
                }
              }
            }}
            aria-label="Damage or heal all selected"
            title="12 or -12 = damage. +12 or h12 = heal. Dice: 2d8+4. Type suffix: 8d6 fire"
          />
          <DamageTypeSelect value={damageType} onChange={setDamageType} />
          <button
            type="button"
            className="btn btn-sm btn-accent"
            disabled={!bulkDmg.trim()}
            onClick={() => {
              if (applyHpToIds([...selectedIds], bulkDmg, false)) setBulkDmg('');
            }}
          >
            Damage
          </button>
          <button
            type="button"
            className="btn btn-sm btn-heal"
            disabled={!bulkDmg.trim()}
            onClick={() => {
              if (applyHpToIds([...selectedIds], bulkDmg, true)) setBulkDmg('');
            }}
          >
            Heal
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setBulkOpen(true)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const id =
                (focusedId && selectedIds.has(focusedId)
                  ? focusedId
                  : selectedCombatants[0]?.id) ?? combat.combatants[0]?.id;
              if (!id) return;
              setStatBlockId(id);
              setModalOpen(true);
            }}
          >
            Stats
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => {
              const removable = [...selectedIds].filter((id) => {
                const c = combat.combatants.find((x) => x.id === id);
                return !c?.sourcePartyMemberId;
              });
              if (removable.length === 0) {
                pushToast(
                  'Party members stay on the tracker — remove them under Players',
                );
                return;
              }
              for (const id of removable) removeCombatant(id);
              setSelectedIds(new Set());
            }}
          >
            Remove
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Deselect
          </button>
        </div>
      )}

      {bulkOpen && selectedCombatants.length > 0 && (
        <BulkSaveDialog
          combatants={selectedCombatants}
          onClose={() => setBulkOpen(false)}
          onApply={(results) => {
            for (const r of results) {
              if (r.damage > 0) flashDamage(r.combatantId, r.damage);
            }
          }}
        />
      )}

      {modalOpen && statBlockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${statBlockTarget.name} stats`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setModalOpen(false);
              setStatBlockId(null);
            }
          }}
        >
          <div className="card max-h-[90vh] w-full max-w-lg overflow-auto p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text">
                {statBlockTarget.name}
              </h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setModalOpen(false);
                  setStatBlockId(null);
                }}
              >
                Esc
              </button>
            </div>
            <CombatantInspect
              combatant={statBlockTarget}
              form={form}
              liveActions={
                statBlockTarget.statBlock
                  ? {
                      remaining: statBlockTarget.actionsRemaining ?? 3,
                      onUse: (entry, cost) =>
                        applyCombatAction(statBlockTarget.id, entry, cost),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="card w-full max-w-md p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Keyboard shortcuts</h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setHelpOpen(false)}
              >
                Esc
              </button>
            </div>
            <ul className="space-y-1.5 text-sm">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex justify-between gap-4">
                  <kbd className="chip font-mono-stats shrink-0">{s.keys}</kbd>
                  <span className="text-muted">{s.action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {libraryOpen && <EncounterLibrary onClose={() => setLibraryOpen(false)} />}

      {conditionForId && (
        <ConditionDialog
          onCancel={() => setConditionForId(null)}
          onSubmit={(name, rounds) => {
            const combatState = useStore.getState().getActiveCombat();
            const endsOnRound =
              rounds != null && rounds > 0
                ? combatState.round + rounds
                : undefined;
            addCondition(conditionForId, { name, endsOnRound });
            setConditionForId(null);
          }}
        />
      )}

      {initiativePromptOpen && (
        <InitiativePrompt
          combatants={combat.combatants}
          adapter={adapter}
          onClose={closeInitiativePrompt}
          onConfirm={(initiatives) => startCombat(initiatives)}
        />
      )}

      {lootExit && (
        <Modal
          title="Unawarded loot"
          onClose={() => setLootExit(null)}
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLootExit(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const action = lootExit;
                  setLootExit(null);
                  runCombatExit(action);
                }}
              >
                Discard loot &amp; continue
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const action = lootExit;
                  awardAllLoot();
                  setLootExit(null);
                  runCombatExit(action);
                }}
              >
                Award all &amp; continue
              </button>
            </>
          }
        >
          <p className="mb-2 text-sm text-muted">
            Unawarded loot is only on this fight. Discarding clears it — it will
            not appear in Notes unless you award it first.
          </p>
          <ul className="space-y-1 text-xs text-text">
            {pendingLoot(combat.loot).map((l) => (
              <li key={l.id} className="rounded border border-border/70 px-2 py-1">
                {l.boss ? '★ ' : ''}
                {l.text}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </main>
  );
}
