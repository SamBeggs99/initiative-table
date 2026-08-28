import { useEffect, useMemo, useState } from 'react';
import { getCreatureById, searchCreatures } from '../lib/bestiary';
import {
  addCreatureEntry,
  blankEncounter,
  checkEncounterDependencies,
  computeEncounterDifficulty,
  copyHomebrewToCampaign,
  duplicateEncounter,
  filterEncounters,
  promoteHomebrewToGlobal,
  removeCreatureEntry,
  scaleEncounter,
  setCreatureEntryQuantity,
  systemGateReason,
  type MissingDependency,
} from '../lib/encounter-library';
import { useStore } from '../store';
import { ConfirmDialog, PromptDialog } from './ui/AskDialog';
import type { EncounterLootLine, SavedEncounter, StatBlock } from '../types';
import { blankLootLine, lootKindLabel } from '../lib/loot';

function DepDialog({
  missing,
  campaignId,
  onCancel,
  onResolved,
}: {
  missing: MissingDependency[];
  campaignId: string;
  onCancel: () => void;
  onResolved: (opts: {
    creatureIdMap: Record<string, string>;
    omitCreatures: string[];
    omitNpcs: string[];
  }) => void;
}) {
  const [choices, setChoices] = useState<
    Record<string, 'promote' | 'copy' | 'omit'>
  >(() => {
    const init: Record<string, 'promote' | 'copy' | 'omit'> = {};
    for (const m of missing) {
      const key = m.kind === 'creature' ? m.creatureId : m.npcId;
      init[key] = m.kind === 'npc' ? 'omit' : 'copy';
    }
    return init;
  });
  const [busy, setBusy] = useState(false);

  // Own Escape so the parent library listener does not unmount this mid-choice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-8 w-full max-w-lg card p-4 shadow-2xl">
        <h3 className="mb-1 text-sm font-semibold text-text">Missing dependencies</h3>
        <p className="mb-3 text-xs text-muted">
          This encounter references creatures or NPCs this campaign cannot see. Choose
          for each — we will not load a half-populated fight silently.
        </p>
        <ul className="mb-3 max-h-64 space-y-2 overflow-auto text-xs">
          {missing.map((m) => {
            const key = m.kind === 'creature' ? m.creatureId : m.npcId;
            const label =
              m.kind === 'creature' ? m.nameSnapshot : `NPC ${m.npcId.slice(0, 8)}…`;
            return (
              <li key={key} className="card p-2.5">
                <div className="font-medium text-text">{label}</div>
                <div className="text-muted">{m.reason}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.kind === 'creature' && m.block?.origin === 'homebrew' && (
                    <>
                      <button
                        type="button"
                        className={`rounded border px-2 py-0.5 ${
                          choices[key] === 'promote'
                            ? 'border-accent text-accent'
                            : 'border-border text-muted'
                        }`}
                        onClick={() => setChoices((c) => ({ ...c, [key]: 'promote' }))}
                      >
                        Promote to global
                      </button>
                      <button
                        type="button"
                        className={`rounded border px-2 py-0.5 ${
                          choices[key] === 'copy'
                            ? 'border-accent text-accent'
                            : 'border-border text-muted'
                        }`}
                        onClick={() => setChoices((c) => ({ ...c, [key]: 'copy' }))}
                      >
                        Copy into this campaign
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 ${
                      choices[key] === 'omit'
                        ? 'border-damage text-damage'
                        : 'border-border text-muted'
                    }`}
                    onClick={() => setChoices((c) => ({ ...c, [key]: 'omit' }))}
                  >
                    Load without
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="btn btn-primary"
            onClick={async () => {
              setBusy(true);
              const creatureIdMap: Record<string, string> = {};
              const omitCreatures: string[] = [];
              const omitNpcs: string[] = [];
              try {
                for (const m of missing) {
                  if (m.kind === 'npc') {
                    if (choices[m.npcId] === 'omit') omitNpcs.push(m.npcId);
                    continue;
                  }
                  const choice = choices[m.creatureId] ?? 'omit';
                  if (choice === 'omit') {
                    omitCreatures.push(m.creatureId);
                    continue;
                  }
                  if (choice === 'promote') {
                    const p = await promoteHomebrewToGlobal(m.creatureId);
                    if (p) creatureIdMap[m.creatureId] = p.id;
                    else omitCreatures.push(m.creatureId);
                  } else {
                    const c = await copyHomebrewToCampaign(m.creatureId, campaignId);
                    if (c) creatureIdMap[m.creatureId] = c.id;
                    else omitCreatures.push(m.creatureId);
                  }
                }
                onResolved({ creatureIdMap, omitCreatures, omitNpcs });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EncounterLibrary({ onClose }: { onClose: () => void }) {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const encounters = useStore((s) => s.encounters);
  const upsertEncounter = useStore((s) => s.upsertEncounter);
  const deleteEncounter = useStore((s) => s.deleteEncounter);
  const loadEncounter = useStore((s) => s.loadEncounter);
  const saveCombatAsEncounter = useStore((s) => s.saveCombatAsEncounter);
  const sourceEncounterName = useStore(
    (s) =>
      (s.activeCampaignId
        ? s.combatByCampaign[s.activeCampaignId]?.sourceEncounterName
        : undefined) ?? '',
  );

  const [query, setQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  const [neverRun, setNeverRun] = useState(false);
  const [systemFilter, setSystemFilter] = useState<'all' | 'dnd5e' | 'pf2e'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [deps, setDeps] = useState<{
    encounter: SavedEncounter;
    missing: MissingDependency[];
  } | null>(null);
  const [monsterMeta, setMonsterMeta] = useState<
    Record<string, { cr?: string; level?: number }[]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerHits, setPickerHits] = useState<StatBlock[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [namePrompt, setNamePrompt] = useState<'new' | 'save-fight' | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const defaultTag = campaign?.name ?? null;

  const filtered = useMemo(
    () =>
      filterEncounters(encounters, {
        query,
        system: systemFilter,
        campaignTag: defaultTag,
        showAllTags,
        difficulty: 'all',
        neverRun,
      }),
    [encounters, query, systemFilter, defaultTag, showAllTags, neverRun],
  );

  // Selection must stay inside the filtered list, or the detail pane edits an
  // encounter the list no longer shows.
  useEffect(() => {
    if (selectedId && !filtered.some((e) => e.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selected =
    (selectedId ? filtered.find((e) => e.id === selectedId) : null) ??
    filtered[0] ??
    null;

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      const metas = await Promise.all(
        selected.entries.map(async (e) => {
          const b = await getCreatureById(e.creatureId);
          return {
            cr: b?.cr,
            level: b?.pf2e?.level,
          };
        }),
      );
      if (!cancelled) {
        setMonsterMeta((m) => ({ ...m, [selected.id]: metas }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const previewEncounter = useMemo(() => {
    if (!selected) return null;
    return scale !== 1 ? scaleEncounter(selected, scale) : selected;
  }, [selected, scale]);

  const difficulty = useMemo(() => {
    if (!previewEncounter || !campaign) return null;
    const metas = monsterMeta[previewEncounter.id] ?? monsterMeta[selected?.id ?? ''] ?? [];
    return computeEncounterDifficulty(previewEncounter, campaign.party, metas);
  }, [previewEncounter, campaign, monsterMeta, selected?.id]);

  const gate = selected && campaign ? systemGateReason(selected, campaign.system) : null;

  useEffect(() => {
    if (!pickerOpen || !campaign) {
      setPickerHits([]);
      return;
    }
    let cancelled = false;
    setPickerBusy(true);
    const handle = window.setTimeout(async () => {
      try {
        const found = await searchCreatures({
          system: campaign.system,
          campaignId: campaign.id,
          query: pickerQuery,
        });
        if (!cancelled) setPickerHits(found.slice(0, 20).map((r) => r.creature));
      } finally {
        if (!cancelled) setPickerBusy(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [pickerOpen, pickerQuery, campaign]);

  const patchSelected = (next: SavedEncounter) => {
    upsertEncounter(next);
    setSelectedId(next.id);
  };

  const createBlank = () => {
    if (!campaign) return;
    setNamePrompt('new');
  };

  const tryLoad = async (encounter: SavedEncounter) => {
    if (!campaign) return;
    setError(null);
    if (systemGateReason(encounter, campaign.system)) {
      setError(systemGateReason(encounter, campaign.system));
      return;
    }
    const scaled = scale !== 1 ? scaleEncounter(encounter, scale) : encounter;
    const check = await checkEncounterDependencies(scaled, campaign);
    if (!check.ok) {
      setDeps({ encounter: scaled, missing: check.missing });
      return;
    }
    const result = await loadEncounter(scaled);
    if (!result.ok) setError(result.error);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-4 flex max-h-[90vh] w-full max-w-3xl flex-col card shadow-2xl">
        <div className="header-vine flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Encounter library</h2>
            <p className="text-[11px] text-muted">
              Build enemy packs here. Run pulls your party into the tracker with them —
              Start combat when you&apos;re ready.
            </p>
          </div>
          <button type="button" className="text-muted hover:text-text" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:flex-row">
          <div className="flex w-full flex-col gap-2 md:w-1/2">
            <input
              className="w-full rounded border border-border bg-panel-2 px-2 py-1.5 text-sm text-text"
              placeholder="Search name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-1 text-xs">
              <button
                type="button"
                className={`rounded border px-2 py-1 ${
                  !showAllTags ? 'border-accent text-accent' : 'border-border text-muted'
                }`}
                onClick={() => setShowAllTags(false)}
              >
                Tag: {defaultTag ?? '—'}
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-1 ${
                  showAllTags ? 'border-accent text-accent' : 'border-border text-muted'
                }`}
                onClick={() => setShowAllTags(true)}
              >
                Show all
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-1 ${
                  neverRun ? 'border-condition text-condition' : 'border-border text-muted'
                }`}
                onClick={() => setNeverRun((v) => !v)}
              >
                Never run
              </button>
              <select
                className="field px-1.5 py-1"
                value={systemFilter}
                onChange={(e) =>
                  setSystemFilter(e.target.value as 'all' | 'dnd5e' | 'pf2e')
                }
              >
                <option value="all">All systems</option>
                <option value="dnd5e">D&D 5e</option>
                <option value="pf2e">PF2e</option>
              </select>
            </div>

            <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto text-sm">
              {filtered.length === 0 ? (
                <li className="text-muted">No encounters match.</li>
              ) : (
                filtered.map((e) => {
                  const blocked =
                    campaign != null ? systemGateReason(e, campaign.system) : null;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col rounded px-2 py-1.5 text-left ${
                          selected?.id === e.id ? 'bg-panel-2' : 'hover:bg-panel-2'
                        } ${blocked ? 'opacity-50' : ''}`}
                        onClick={() => {
                          setSelectedId(e.id);
                          setScale(1);
                        }}
                      >
                        <span className={blocked ? 'text-muted' : 'text-text'}>{e.name}</span>
                        <span className="text-[10px] text-muted">
                          {e.system} · {e.campaignTags.join(', ') || 'no tags'} ·{' '}
                          {(e.timesRun ?? 0) > 0
                            ? `run ${e.timesRun}${
                                e.lastRunAt
                                  ? ` · ${new Date(e.lastRunAt).toLocaleDateString()}`
                                  : ''
                              }`
                            : 'never run'}
                          {blocked ? ` · ${blocked}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="btn btn-accent"
                disabled={!campaign}
                onClick={createBlank}
              >
                New encounter
              </button>
              <button
                type="button"
                className="btn"
                disabled={!campaign}
                onClick={() => {
                  if (!campaign) return;
                  setNamePrompt('save-fight');
                }}
              >
                Save current fight
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 border-t border-border pt-3 md:w-1/2 md:border-l md:border-t-0 md:pl-3 md:pt-0">
            {selected && previewEncounter ? (
              <>
                <h3 className="text-sm font-semibold text-text">{selected.name}</h3>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Notes
                  <textarea
                    className="field mt-1 w-full text-xs"
                    rows={2}
                    value={selected.notes}
                    onChange={(e) =>
                      patchSelected({ ...selected, notes: e.target.value })
                    }
                    placeholder="Tactics, terrain, triggers…"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="section-title">Loot &amp; treasure</span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        patchSelected({
                          ...selected,
                          loot: [
                            ...(selected.loot ?? []),
                            blankLootLine('', { kind: 'treasure' }),
                          ],
                        })
                      }
                    >
                      + Line
                    </button>
                  </div>
                  <p className="text-[11px] leading-snug text-muted">
                    Reminder after the fight — award from the tracker so it pins
                    into Notes.
                  </p>
                  {(selected.loot ?? []).length === 0 ? (
                    <p className="rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted">
                      No loot planned. Add gold, a boss item, or a key.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(selected.loot ?? []).map((line, index) => (
                        <li
                          key={line.id}
                          className="rounded border border-border/70 bg-panel-2/40 p-2"
                        >
                          <div className="mb-1 flex flex-wrap gap-1">
                            <select
                              className="field py-0.5 text-[11px]"
                              value={line.kind}
                              aria-label="Loot kind"
                              onChange={(e) => {
                                const kind = e.target.value as EncounterLootLine['kind'];
                                const loot = (selected.loot ?? []).map((l, i) =>
                                  i === index ? { ...l, kind } : l,
                                );
                                patchSelected({ ...selected, loot });
                              }}
                            >
                              <option value="treasure">{lootKindLabel('treasure')}</option>
                              <option value="item">{lootKindLabel('item')}</option>
                              <option value="other">{lootKindLabel('other')}</option>
                            </select>
                            <label className="flex items-center gap-1 text-[11px] text-muted">
                              <input
                                type="checkbox"
                                checked={!!line.boss}
                                onChange={(e) => {
                                  const loot = (selected.loot ?? []).map((l, i) =>
                                    i === index
                                      ? { ...l, boss: e.target.checked }
                                      : l,
                                  );
                                  patchSelected({ ...selected, loot });
                                }}
                              />
                              Boss
                            </label>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost ml-auto hover:text-damage"
                              aria-label="Remove loot line"
                              onClick={() =>
                                patchSelected({
                                  ...selected,
                                  loot: (selected.loot ?? []).filter(
                                    (_, i) => i !== index,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                          <input
                            className="field w-full py-1 text-xs"
                            value={line.text}
                            placeholder="400 gp · Circlet of Whispering Flame · vault key"
                            onChange={(e) => {
                              const loot = (selected.loot ?? []).map((l, i) =>
                                i === index ? { ...l, text: e.target.value } : l,
                              );
                              patchSelected({ ...selected, loot });
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="section-title">Enemies</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-accent"
                      disabled={!campaign || !!gate}
                      onClick={() => {
                        setPickerOpen((v) => !v);
                        setPickerQuery('');
                      }}
                    >
                      {pickerOpen ? 'Close picker' : '+ Add creature'}
                    </button>
                  </div>

                  {pickerOpen && campaign && (
                    <div className="card space-y-1.5 p-2">
                      <input
                        className="field w-full text-xs"
                        placeholder="Search bestiary…"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        autoFocus
                      />
                      <ul className="max-h-36 space-y-0.5 overflow-auto text-xs">
                        {pickerBusy ? (
                          <li className="text-muted">Searching…</li>
                        ) : pickerHits.length === 0 ? (
                          <li className="text-muted">No matches.</li>
                        ) : (
                          pickerHits.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-panel-2"
                                onClick={() => {
                                  patchSelected(addCreatureEntry(selected, c, 1));
                                }}
                              >
                                <span className="truncate text-text">{c.name}</span>
                                <span className="shrink-0 font-mono-stats text-[10px] text-muted">
                                  {c.pf2e?.level != null ? `L${c.pf2e.level}` : `CR ${c.cr}`}
                                </span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}

                  {previewEncounter.entries.length === 0 &&
                  previewEncounter.npcIds.length === 0 ? (
                    <p className="text-xs text-muted">
                      No enemies yet — add creatures from the bestiary, or save a fight
                      you already staged.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {previewEncounter.entries.map((e) => (
                        <li
                          key={e.creatureId + e.nameSnapshot}
                          className="flex items-center gap-2 rounded border border-border/60 px-2 py-1"
                        >
                          <span className="min-w-0 flex-1 truncate text-text">
                            {e.nameOverride || e.nameSnapshot}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={24}
                            className="field w-14 py-0.5 text-center font-mono-stats tabular-nums"
                            value={e.quantity}
                            disabled={scale !== 1}
                            title={
                              scale !== 1
                                ? 'Reset scale to ×1 to edit quantities'
                                : 'Quantity'
                            }
                            onChange={(ev) => {
                              const raw = ev.target.value;
                              if (raw.trim() === '') return;
                              const n = Number(raw);
                              if (!Number.isFinite(n)) return;
                              patchSelected(
                                setCreatureEntryQuantity(
                                  selected,
                                  e.creatureId,
                                  n,
                                ),
                              );
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost hover:text-damage"
                            disabled={scale !== 1}
                            aria-label={`Remove ${e.nameSnapshot}`}
                            onClick={() =>
                              patchSelected(removeCreatureEntry(selected, e.creatureId))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                      {previewEncounter.npcIds.length > 0 && (
                        <li className="text-muted">
                          {previewEncounter.npcIds.length} roster NPC(s) on load
                        </li>
                      )}
                      {previewEncounter.trackerPresets.length > 0 && (
                        <li className="text-muted">
                          {previewEncounter.trackerPresets.length} clock(s) armed on load
                        </li>
                      )}
                      {(previewEncounter.loot ?? []).filter((l) => l.text.trim())
                        .length > 0 && (
                        <li className="text-muted">
                          {
                            (previewEncounter.loot ?? []).filter((l) => l.text.trim())
                              .length
                          }{' '}
                          loot line(s) to award after the fight
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                <div className="card p-2.5 text-xs">
                  <div className="text-muted">Difficulty vs this party (live)</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {campaign?.party.length ? (
                      difficulty ? (
                        <>
                          <span
                            className={`badge-soft text-sm capitalize ${
                              difficulty.tier === 'deadly' ||
                              difficulty.tier === 'extreme'
                                ? 'badge-condition'
                                : difficulty.tier === 'hard' ||
                                    difficulty.tier === 'severe'
                                  ? 'badge-accent'
                                  : ''
                            }`}
                          >
                            {difficulty.tier}
                          </span>
                          <span className="font-mono-stats text-text">
                            {difficulty.adjustedXp} adj XP
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">…</span>
                      )
                    ) : (
                      <span className="text-muted">
                        Add party members to see difficulty
                      </span>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted">
                  Scale
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.5}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                  />
                  <span className="font-mono-stats text-text">×{scale}</span>
                </label>

                {gate && (
                  <p className="rounded border border-damage/40 bg-panel-2 p-2 text-xs text-damage">
                    {gate}
                  </p>
                )}
                {error && <p className="text-xs text-damage">{error}</p>}

                <div className="mt-auto flex flex-wrap gap-1 pt-2">
                  <button
                    type="button"
                    disabled={
                      !!gate ||
                      !campaign ||
                      (previewEncounter.entries.length === 0 &&
                        previewEncounter.npcIds.length === 0)
                    }
                    className="btn btn-primary"
                    onClick={() => void tryLoad(selected)}
                    title="Replace current fight with these enemies and your party"
                  >
                    Run with party
                    {(selected.timesRun ?? 0) > 0 ? ' again' : ''}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    title="Clone this pack so you can tweak numbers without losing the original"
                    onClick={() => {
                      const copy = duplicateEncounter(selected);
                      upsertEncounter(copy);
                      setSelectedId(copy.id);
                    }}
                  >
                    Clone
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost hover:text-damage"
                    onClick={() => setPendingDelete(true)}
                  >
                    Delete
                  </button>
                </div>

                <div className="text-[10px] text-muted">
                  Tags:{' '}
                  <input
                    className="field mt-0.5 w-full text-xs"
                    value={selected.campaignTags.join(', ')}
                    onChange={(e) =>
                      upsertEncounter({
                        ...selected,
                        campaignTags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Solamento, Uldir"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                Create a <span className="text-text">New encounter</span>, add enemy counts
                from the bestiary, then <span className="text-text">Run with party</span>.
                Or save a fight you already staged on the tracker.
              </p>
            )}
          </div>
        </div>
      </div>

      {deps && campaign && (
        <DepDialog
          missing={deps.missing}
          campaignId={campaign.id}
          onCancel={() => setDeps(null)}
          onResolved={async (opts) => {
            const encounter = deps.encounter;
            setDeps(null);
            const result = await loadEncounter(encounter, opts);
            if (!result.ok) setError(result.error);
            else onClose();
          }}
        />
      )}

      {namePrompt && campaign && (
        <PromptDialog
          title={namePrompt === 'new' ? 'New encounter' : 'Save current fight'}
          label="Name"
          defaultValue={
            namePrompt === 'save-fight'
              ? sourceEncounterName || 'Current fight'
              : 'New encounter'
          }
          confirmLabel={namePrompt === 'new' ? 'Create' : 'Save'}
          onCancel={() => setNamePrompt(null)}
          onSubmit={(raw) => {
            const name =
              raw.trim() ||
              (namePrompt === 'save-fight' ? 'Current fight' : 'New encounter');
            if (namePrompt === 'new') {
              const created = blankEncounter(campaign.system, name, [
                campaign.name,
              ]);
              upsertEncounter(created);
              setSelectedId(created.id);
              setScale(1);
              setPickerOpen(true);
            } else {
              const id = saveCombatAsEncounter(name, [campaign.name]);
              if (id) setSelectedId(id);
            }
            setNamePrompt(null);
          }}
        />
      )}

      {pendingDelete && selected && (
        <ConfirmDialog
          title="Delete encounter?"
          message={`Delete “${selected.name}”? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => {
            deleteEncounter(selected.id);
            setSelectedId(null);
            setPendingDelete(false);
          }}
        />
      )}
    </div>
  );
}
