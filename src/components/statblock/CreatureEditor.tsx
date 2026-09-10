import { useEffect, useMemo, useState } from 'react';
import {
  cloneToHomebrew,
  deleteHomebrewCreature,
  saveHomebrewCreature,
} from '../../lib/bestiary';
import { parseStatBlockText } from '../../lib/statblock-import';
import {
  ABILITY_LABELS,
  abilityBonusOf,
  abilityKeys,
  abilityModifier,
  adjustAbilityBonus,
  blankStatBlock,
  draftFromImport,
  estimateChallenge,
  exportCreatureJson,
  formatModifier,
  HOMEBREW_EXPORT_WARNING,
  hpAvgFromHitDice,
  proficiencyBonusFromCr,
} from '../../lib/statblock-derived';
import { getSystemAdapter } from '../../systems';
import { formatSpeedField, parseSpeedField } from '../../lib/speed-field';
import type { Ability, StatBlock, System } from '../../types';
import { ConfirmDialog } from '../ui/AskDialog';
import { PortraitField } from '../ui/Portrait';
import { EntryListEditor } from './EntryListEditor';
import { SkillListEditor } from './SkillListEditor';
import { AbilityBonusNudge } from './AbilityBonusNudge';
import {
  DefenseTraitChips,
  type DefenseKind,
} from './DefenseTraitChips';
import { CreatureSpellPicker } from './CreatureSpellPicker';
import { StatBlockPreview } from './StatBlockPreview';

export type EditorMode = 'new' | 'clone' | 'import' | 'edit';

interface CreatureEditorProps {
  system: System;
  campaignId: string;
  mode: EditorMode;
  /** Source creature for clone/edit; ignored for new/import until paste lands. */
  initial?: StatBlock;
  /**
   * Editing a block that lives on something else (an NPC record, say) rather
   * than in the bestiary. Save hands the block back instead of writing it to
   * the catalog, and the catalog-only controls stay hidden.
   */
  embedded?: boolean;
  /** Header label. Defaults to one read off `mode`. */
  title?: string;
  onClose: () => void;
  onSaved: (creature: StatBlock) => void;
  onDeleted?: (id: string) => void;
}

function DefenseField({
  label,
  kind,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  kind: DefenseKind;
  placeholder: string;
  value: string;
  onChange: (next: string | undefined) => void;
}) {
  const id = `defense-${kind}`;
  return (
    <div>
      <label className="block text-xs text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {value.trim() && (
        <div className="mt-1">
          <DefenseTraitChips value={value} kind={kind} />
        </div>
      )}
    </div>
  );
}

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CreatureEditor({
  system,
  campaignId,
  mode,
  initial,
  embedded,
  title,
  onClose,
  onSaved,
  onDeleted,
}: CreatureEditorProps) {
  const adapter = getSystemAdapter(system);
  const form = adapter.statBlockForm;

  const [draft, setDraft] = useState<StatBlock>(() => {
    if (mode === 'new' || !initial) {
      return blankStatBlock(system, { campaignId });
    }
    if (mode === 'clone') {
      const name = initial.name.endsWith(' (custom)')
        ? initial.name
        : `${initial.name} (custom)`;
      return {
        ...structuredClone(initial),
        id: crypto.randomUUID(),
        origin: 'homebrew',
        campaignId,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        source: 'Homebrew',
        derivedFromId: initial.id,
        retired: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pf2e:
          form.showPf2eBlock
            ? initial.pf2e ?? {
                level: Number(initial.cr) || 0,
                perception: 0,
                fortitude: 0,
                reflex: 0,
                will: 0,
                traits: [],
                actionCosts: {},
              }
            : undefined,
      };
    }
    return structuredClone(initial);
  });

  const [pasteRaw, setPasteRaw] = useState('');
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [confidenceNotes, setConfidenceNotes] = useState<string[]>([]);
  const [pbOverride, setPbOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [speedText, setSpeedText] = useState(() =>
    formatSpeedField(
      mode === 'new' || !initial
        ? blankStatBlock(system, { campaignId }).speed
        : initial.speed,
    ),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const derivedPb = proficiencyBonusFromCr(draft.cr);
  const pb = pbOverride ?? derivedPb;
  const estimate = useMemo(() => estimateChallenge(draft), [draft]);

  const patch = (partial: Partial<StatBlock>) => {
    setDraft((d) => ({ ...d, ...partial, updatedAt: Date.now() }));
  };

  const applySpeedText = (raw: string, tidy: boolean) => {
    const parsed = parseSpeedField(raw);
    if (!parsed) return;
    patch({ speed: parsed });
    if (tidy) setSpeedText(formatSpeedField(parsed));
  };

  const patchAbility = (ab: Ability, score: number) => {
    setDraft((d) => ({
      ...d,
      abilities: { ...d.abilities, [ab]: score },
      updatedAt: Date.now(),
    }));
  };

  const patchAbilityBonus = (ab: Ability, delta: number) => {
    setDraft((d) => ({
      ...d,
      abilityBonuses: adjustAbilityBonus(d.abilityBonuses, ab, delta),
      updatedAt: Date.now(),
    }));
  };

  const patchPf2e = (partial: NonNullable<StatBlock['pf2e']>) => {
    setDraft((d) => ({
      ...d,
      pf2e: { ...(d.pf2e ?? partial), ...partial },
      updatedAt: Date.now(),
    }));
  };

  const applyHitDiceAvg = () => {
    const avg = hpAvgFromHitDice(draft.hitDice);
    if (avg != null) patch({ hpAvg: avg });
  };

  const runImportParse = () => {
    const result = parseStatBlockText(pasteRaw);
    const next = draftFromImport(result.statBlock, {
      system,
      campaignId: draft.campaignId,
    });
    setDraft(next);
    setSpeedText(formatSpeedField(next.speed));
    setUnparsed(result.unparsed);
    const low = Object.entries(result.confidence)
      .filter(([, v]) => v === 'low' || v === 'missing')
      .map(([k, v]) => `${k}: ${v}`);
    setConfidenceNotes(low);
    setError(null);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (embedded) {
      const parsedSpeed = parseSpeedField(speedText);
      onSaved({
        ...draft,
        speed: parsedSpeed ?? draft.speed,
        name: draft.name.trim(),
        updatedAt: Date.now(),
      });
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedSpeed = parseSpeedField(speedText);
      const saved = await saveHomebrewCreature({
        ...draft,
        speed: parsedSpeed ?? draft.speed,
        name: draft.name.trim(),
        source: 'Homebrew',
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    const copy = await cloneToHomebrew(draft, {
      campaignId: draft.campaignId ?? campaignId,
      nameSuffix: ' (copy)',
    });
    onSaved(copy);
    onClose();
  };

  const remove = async () => {
    if (draft.origin !== 'homebrew') return;
    setConfirmDelete(true);
  };

  const doRemove = async () => {
    setConfirmDelete(false);
    const ok = await deleteHomebrewCreature(draft.id);
    if (ok) {
      onDeleted?.(draft.id);
      onClose();
    } else {
      setError('Only homebrew creatures can be deleted from the editor.');
    }
  };

  const exportJson = () => {
    downloadJson(
      `${draft.slug || 'creature'}.json`,
      exportCreatureJson(draft),
    );
  };

  const scopeIsCampaign = draft.campaignId != null && draft.campaignId !== '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creature-editor-title"
    >
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden card shadow-2xl">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <h2 id="creature-editor-title" className="text-sm font-semibold text-text">
            {title ?? (
              <>
                {mode === 'new' && 'New creature'}
                {mode === 'clone' && 'Clone creature'}
                {mode === 'import' && 'Import creature'}
                {mode === 'edit' && 'Edit homebrew'}
              </>
            )}
          </h2>
          <span className="text-xs text-muted">{adapter.label}</span>
          <div className="ml-auto flex flex-wrap gap-1">
            <button
              type="button"
              className="btn"
              onClick={exportJson}
            >
              Export JSON
            </button>
            {!embedded && mode !== 'new' && draft.origin === 'homebrew' && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={duplicate}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="rounded border border-damage/50 px-2 py-1 text-xs text-damage"
                  onClick={remove}
                >
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              className="btn btn-accent"
              onClick={save}
            >
              {saving ? 'Saving…' : embedded ? 'Done' : 'Save homebrew'}
            </button>
          </div>
        </header>

        <p className="border-b border-border bg-panel-2 px-3 py-1.5 text-[11px] leading-relaxed text-muted">
          {HOMEBREW_EXPORT_WARNING}
        </p>

        {mode === 'import' && (
          <div className="border-b border-border p-3">
            <label className="block text-xs text-muted">
              Paste a plain-text 5e stat block
              <textarea
                className="mt-1 min-h-28 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats text-xs text-text"
                value={pasteRaw}
                onChange={(e) => setPasteRaw(e.target.value)}
                placeholder={'Goblin\nSmall humanoid…'}
              />
            </label>
            <button
              type="button"
              className="mt-2 rounded border border-accent px-2 py-1 text-xs text-accent disabled:opacity-40"
              onClick={runImportParse}
              disabled={!pasteRaw.trim()}
            >
              Parse into form
            </button>
          </div>
        )}

        {(unparsed.length > 0 || confidenceNotes.length > 0) && (
          <div className="border-b border-border bg-damage/5 px-3 py-2 text-xs text-muted">
            <p className="font-semibold text-text">Review — incomplete parse</p>
            {confidenceNotes.length > 0 && (
              <p className="mt-1">Low/missing confidence: {confidenceNotes.join(', ')}</p>
            )}
            {unparsed.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {unparsed.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            )}
            <p className="mt-1">Edit the fields below — nothing was silently dropped.</p>
          </div>
        )}

        {error && (
          <p className="border-b border-border px-3 py-2 text-xs text-damage" role="alert">
            {error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
          <div className="min-h-0 space-y-4 overflow-auto p-3 text-sm">
            {/* Identity */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Identity
              </h3>
              <label className="block text-xs text-muted">
                Name
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <PortraitField
                value={draft.portraitDataUrl}
                onChange={(portraitDataUrl) => patch({ portraitDataUrl })}
              />
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs text-muted">
                  Size
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.size}
                    onChange={(e) => patch({ size: e.target.value })}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Type
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.type}
                    onChange={(e) => patch({ type: e.target.value })}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Alignment
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.alignment}
                    onChange={(e) => patch({ alignment: e.target.value })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={scopeIsCampaign}
                  onChange={(e) =>
                    patch({
                      campaignId: e.target.checked ? campaignId : undefined,
                    })
                  }
                />
                Campaign-scoped (default). Uncheck to promote to global homebrew for{' '}
                {adapter.label}.
              </label>
            </section>

            {/* Defences */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Defences
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="block text-xs text-muted">
                  AC
                  <input
                    type="number"
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                    value={draft.ac}
                    onChange={(e) => patch({ ac: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="col-span-1 block text-xs text-muted sm:col-span-3">
                  AC notes
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.acDesc ?? ''}
                    onChange={(e) =>
                      patch({ acDesc: e.target.value || undefined })
                    }
                  />
                </label>
                <label className="block text-xs text-muted">
                  Hit dice
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats text-text"
                    value={draft.hitDice}
                    onChange={(e) => patch({ hitDice: e.target.value })}
                    onBlur={applyHitDiceAvg}
                  />
                </label>
                <label className="block text-xs text-muted">
                  HP avg
                  <input
                    type="number"
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                    value={draft.hpAvg}
                    onChange={(e) => patch({ hpAvg: Number(e.target.value) || 0 })}
                    title="Auto-fills from hit dice on blur; stays overridable"
                  />
                </label>
                <label className="col-span-2 block text-xs text-muted">
                  Speed (walk=30,fly=60 or JSON)
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats text-xs text-text"
                    value={speedText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setSpeedText(raw);
                      applySpeedText(raw, false);
                    }}
                    onBlur={() => applySpeedText(speedText, true)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="space-y-2">
                <DefenseField
                  label="Resistances"
                  kind="resist"
                  placeholder="fire, lightning; bludgeoning from nonmagical attacks"
                  value={draft.resistances ?? ''}
                  onChange={(resistances) => patch({ resistances })}
                />
                <DefenseField
                  label="Immunities"
                  kind="immune"
                  placeholder="poison, fire"
                  value={draft.immunities ?? ''}
                  onChange={(immunities) => patch({ immunities })}
                />
                <DefenseField
                  label="Vulnerabilities"
                  kind="vulnerable"
                  placeholder="radiant"
                  value={draft.vulnerabilities ?? ''}
                  onChange={(vulnerabilities) => patch({ vulnerabilities })}
                />
                <DefenseField
                  label="Condition immunities"
                  kind="condition"
                  placeholder="poisoned, exhaustion"
                  value={draft.conditionImmunities ?? ''}
                  onChange={(conditionImmunities) =>
                    patch({ conditionImmunities })
                  }
                />
              </div>
            </section>

            {/* Abilities */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Ability scores
              </h3>
              <p className="text-[11px] leading-snug text-muted">
                Same for D&amp;D 5e and Pathfinder 2e: enter the score (not the
                modifier). 10 = +0, 9 = −1, 16 = +3. Use +1 under a score for a
                hand-applied modifier — it does not change the printed number.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {abilityKeys().map((ab) => {
                  const bonus = abilityBonusOf(draft.abilityBonuses, ab);
                  const id = `ability-${ab}`;
                  return (
                    <div key={ab} className="block text-xs text-muted">
                      <label htmlFor={id}>{ABILITY_LABELS[ab]}</label>
                      <input
                        id={id}
                        type="number"
                        min={1}
                        max={30}
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.abilities[ab]}
                        onChange={(e) =>
                          patchAbility(ab, Number(e.target.value) || 0)
                        }
                      />
                      <span className="font-mono-stats text-[10px] tabular-nums text-muted">
                        {formatModifier(
                          abilityModifier(draft.abilities[ab]) + bonus,
                        )}
                      </span>
                      <AbilityBonusNudge
                        bonus={bonus}
                        onAdjust={(delta) => patchAbilityBonus(ab, delta)}
                      />
                    </div>
                  );
                })}
              </div>
              <SkillListEditor
                system={system}
                skills={draft.skills}
                onChange={(skills) => patch({ skills })}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted">
                  Senses
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.senses}
                    onChange={(e) => patch({ senses: e.target.value })}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Languages
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.languages}
                    onChange={(e) => patch({ languages: e.target.value })}
                  />
                </label>
              </div>

              {!form.showPf2eBlock && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-muted">
                    {form.challengeLabel}
                    <input
                      className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats text-text"
                      value={draft.cr}
                      onChange={(e) => {
                        setPbOverride(null);
                        patch({ cr: e.target.value });
                      }}
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Proficiency bonus
                    <input
                      type="number"
                      className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                      value={pb}
                      onChange={(e) => setPbOverride(Number(e.target.value) || 0)}
                      title="Auto from CR; overridable"
                    />
                  </label>
                </div>
              )}

              {form.showPf2eBlock && (
                <div className="space-y-2 rounded border border-border p-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="block text-xs text-muted">
                      Level
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.pf2e?.level ?? 0}
                        onChange={(e) => {
                          const level = Number(e.target.value) || 0;
                          patchPf2e({
                            level,
                            perception: draft.pf2e?.perception ?? 0,
                            fortitude: draft.pf2e?.fortitude ?? 0,
                            reflex: draft.pf2e?.reflex ?? 0,
                            will: draft.pf2e?.will ?? 0,
                            traits: draft.pf2e?.traits ?? [],
                            actionCosts: draft.pf2e?.actionCosts ?? {},
                          });
                          patch({ cr: String(level) });
                        }}
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Perception
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.pf2e?.perception ?? 0}
                        onChange={(e) =>
                          patchPf2e({
                            ...(draft.pf2e ?? {
                              level: 0,
                              fortitude: 0,
                              reflex: 0,
                              will: 0,
                              traits: [],
                              actionCosts: {},
                            }),
                            perception: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Fortitude
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.pf2e?.fortitude ?? 0}
                        onChange={(e) =>
                          patchPf2e({
                            ...(draft.pf2e ?? {
                              level: 0,
                              perception: 0,
                              reflex: 0,
                              will: 0,
                              traits: [],
                              actionCosts: {},
                            }),
                            fortitude: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Reflex
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.pf2e?.reflex ?? 0}
                        onChange={(e) =>
                          patchPf2e({
                            ...(draft.pf2e ?? {
                              level: 0,
                              perception: 0,
                              fortitude: 0,
                              will: 0,
                              traits: [],
                              actionCosts: {},
                            }),
                            reflex: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Will
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                        value={draft.pf2e?.will ?? 0}
                        onChange={(e) =>
                          patchPf2e({
                            ...(draft.pf2e ?? {
                              level: 0,
                              perception: 0,
                              fortitude: 0,
                              reflex: 0,
                              traits: [],
                              actionCosts: {},
                            }),
                            will: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-muted">
                    Creature traits (comma-separated)
                    <input
                      className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                      value={(draft.pf2e?.traits ?? []).join(', ')}
                      onChange={(e) =>
                        patchPf2e({
                          ...(draft.pf2e ?? {
                            level: 0,
                            perception: 0,
                            fortitude: 0,
                            reflex: 0,
                            will: 0,
                            actionCosts: {},
                          }),
                          traits: e.target.value
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              <div className="card px-2 py-1.5 text-xs">
                <span className="text-muted">{estimate.label} (estimate, not a calculation): </span>
                <span className="font-mono-stats tabular-nums text-accent">
                  {estimate.value}
                </span>
                <p className="mt-0.5 text-[11px] text-muted">{estimate.note}</p>
              </div>
            </section>

            <EntryListEditor
              label="Traits"
              entries={draft.traits}
              onChange={(traits) => patch({ traits })}
              showDuration
              showOffense
            />
            <CreatureSpellPicker
              block={draft}
              campaignId={draft.campaignId ?? campaignId}
              traitText={draft.traits.map((t) => `${t.name}. ${t.desc}`).join('\n')}
              onChange={(partial) => patch(partial)}
            />
            <EntryListEditor
              label="Actions"
              entries={draft.actions}
              onChange={(actions) => patch({ actions })}
              showActionCosts={form.showPf2eBlock}
              showDamage
              showRequirements
              showDuration
              showOffense
              actionCosts={draft.pf2e?.actionCosts}
              onActionCostsChange={(actionCosts) =>
                patchPf2e({
                  ...(draft.pf2e ?? {
                    level: 0,
                    perception: 0,
                    fortitude: 0,
                    reflex: 0,
                    will: 0,
                    traits: [],
                  }),
                  actionCosts,
                })
              }
            />
            <EntryListEditor
              label="Bonus actions"
              entries={draft.bonusActions}
              onChange={(bonusActions) => patch({ bonusActions })}
              showDamage
              showRequirements
              showDuration
              showOffense
            />
            <EntryListEditor
              label="Reactions"
              entries={draft.reactions}
              onChange={(reactions) => patch({ reactions })}
              showRequirements
              showDuration
              showOffense
            />

            {form.showLegendaryBlock && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Legendary
                </h3>
                {form.showLegendaryResistance && (
                  <p className="text-[11px] text-muted">
                    Put Legendary Resistance in Traits as “Legendary Resistance (3/Day)” — combat
                    hydration reads it from there.
                  </p>
                )}
                <label className="block text-xs text-muted">
                  Legendary description
                  <textarea
                    className="mt-0.5 min-h-16 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                    value={draft.legendaryDesc ?? ''}
                    onChange={(e) =>
                      patch({ legendaryDesc: e.target.value || undefined })
                    }
                  />
                </label>
                <EntryListEditor
                  label="Legendary actions"
                  entries={draft.legendaryActions}
                  onChange={(legendaryActions) => patch({ legendaryActions })}
                  showDuration
                  showOffense
                />
              </section>
            )}
          </div>

          <div className="min-h-0 border-t border-border p-3 lg:border-l lg:border-t-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Live preview
            </h3>
            <StatBlockPreview
              block={draft}
              form={form}
              onAbilityBonus={patchAbilityBonus}
            />
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete creature?"
          message={`Delete “${draft.name}”? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void doRemove()}
        />
      )}
    </div>
  );
}
