import { useMemo, useState } from 'react';
import { importDdbJson } from '../lib/import/ddb';
import { importPathbuilderJson } from '../lib/import/pathbuilder';
import {
  buildSampleEncounter,
  draftToPartyMember,
  emptyPartyDraft,
  isDraftComplete,
  samplePartyForSystem,
  type WizardPartyDraft,
} from '../lib/onboarding';
import { formatAbilityScore } from '../lib/statblock-derived';
import { BloomCluster, CornerVine, SproutMark, VineRule } from './ornament/Botanical';
import { useStore } from '../store';
import type { System } from '../types';

type Step = 'welcome' | 'party' | 'sample' | 'done';

const STEPS: Step[] = ['welcome', 'party', 'sample', 'done'];

function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

export function FirstCampaignWizard({
  onClose,
  forceOpen = false,
}: {
  onClose: () => void;
  /** When true, user opened from “New campaign” even if campaigns already exist. */
  forceOpen?: boolean;
}) {
  const createCampaign = useStore((s) => s.createCampaign);
  const updateCampaign = useStore((s) => s.updateCampaign);
  const deleteCampaign = useStore((s) => s.deleteCampaign);
  const setActiveCampaign = useStore((s) => s.setActiveCampaign);
  const changeCampaignSystem = useStore((s) => s.changeCampaignSystem);
  const upsertPartyMember = useStore((s) => s.upsertPartyMember);
  const deletePartyMember = useStore((s) => s.deletePartyMember);
  const upsertEncounter = useStore((s) => s.upsertEncounter);
  const loadEncounter = useStore((s) => s.loadEncounter);
  const updateSettings = useStore((s) => s.updateSettings);
  const pushToast = useStore((s) => s.pushToast);

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('My campaign');
  const [system, setSystem] = useState<System>('dnd5e');
  const [drafts, setDrafts] = useState<WizardPartyDraft[]>(() =>
    samplePartyForSystem('dnd5e').map((d) => ({ ...d, playerName: '' })),
  );
  const [importPaste, setImportPaste] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranSample, setRanSample] = useState(false);
  /** Member ids created by “Save & continue” so Back→Save does not duplicate. */
  const [wizardPartyIds, setWizardPartyIds] = useState<string[]>([]);
  const [priorCampaignId] = useState(
    () => useStore.getState().activeCampaignId,
  );

  const completeDrafts = useMemo(
    () => drafts.filter(isDraftComplete),
    [drafts],
  );

  const finishOnboarding = () => {
    updateSettings({ onboardingComplete: true });
    onClose();
  };

  const skipAll = () => {
    // Cancelling “New campaign” after stepping forward once must not strand the
    // half-built campaign as the active one. First-run “Skip for now” keeps
    // whatever was made, since the table would otherwise open with nothing.
    if (forceOpen && campaignId) {
      deleteCampaign(campaignId);
      setActiveCampaign(priorCampaignId);
    }
    updateSettings({ onboardingComplete: true });
    onClose();
  };

  const createAndContinue = () => {
    const trimmed = name.trim() || 'My campaign';
    if (campaignId) {
      // Already created this pass — sync name/system edits from going Back.
      updateCampaign(campaignId, { name: trimmed });
      setStep('party');
      return;
    }
    const id = createCampaign(trimmed, system);
    setCampaignId(id);
    setStep('party');
  };

  const onSystemChange = (next: System) => {
    setSystem(next);
    setDrafts(samplePartyForSystem(next).map((d) => ({ ...d, playerName: '' })));
    setImportPaste('');
    setImportError(null);
    if (campaignId) {
      changeCampaignSystem(campaignId, next);
      // Sample drafts reset — drop the previous wizard-saved roster too.
      for (const id of wizardPartyIds) deletePartyMember(id);
      setWizardPartyIds([]);
    }
  };

  const updateDraft = (index: number, patch: Partial<WizardPartyDraft>) => {
    setDrafts((list) =>
      list.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  };

  const addBlankRow = () => {
    if (drafts.length >= 6) return;
    setDrafts((list) => [...list, emptyPartyDraft()]);
  };

  const removeRow = (index: number) => {
    setDrafts((list) => list.filter((_, i) => i !== index));
  };

  const savePartyAndContinue = () => {
    if (!campaignId) return;
    // Replace the previous wizard save so Back → Save does not clone the roster.
    for (const id of wizardPartyIds) deletePartyMember(id);
    const nextIds: string[] = [];
    for (const d of completeDrafts) {
      const member = draftToPartyMember(campaignId, system, d);
      upsertPartyMember(member);
      nextIds.push(member.id);
    }
    setWizardPartyIds(nextIds);
    setStep('sample');
  };

  const applyImport = () => {
    if (!campaignId || !importPaste.trim()) return;
    const result =
      system === 'pf2e'
        ? importPathbuilderJson(importPaste, campaignId)
        : importDdbJson(importPaste, campaignId);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setImportError(null);
    const member = {
      ...result.member,
      id: result.member.id ?? crypto.randomUUID(),
      campaignId,
    };
    upsertPartyMember(member);
    setImportPaste('');
    pushToast(`Imported ${member.name} — already on the roster`);
  };

  const seedSample = async (andRun: boolean) => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const enc = await buildSampleEncounter(system, name.trim() || 'My campaign');
      if (!enc) {
        pushToast(
          system === 'pf2e'
            ? 'PF2e has no bundled bestiary yet — add creatures from homebrew later'
            : 'Bundled creatures not ready yet — try again in a moment',
        );
        setStep('done');
        return;
      }
      upsertEncounter(enc);
      if (andRun) {
        const result = await loadEncounter(enc);
        if (!result.ok) pushToast(result.error);
        else setRanSample(true);
      } else {
        pushToast(`Saved “${enc.name}” to the Encounter library`);
      }
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 backdrop-blur-sm p-4">
      <div className="relative my-6 w-full max-w-xl card overflow-hidden shadow-2xl">
        <CornerVine size={92} className="ornament-soft" />
        <div className="relative border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <SproutMark size={24} />
            <div>
              <h2 className="text-base font-semibold text-text">
                {forceOpen ? 'New campaign' : 'Welcome to Dungeon Master MultiTool'}
              </h2>
              <p className="text-xs text-muted">
                {forceOpen
                  ? 'Name it, seat the party, optionally seed a starter fight.'
                  : 'Three steps — campaign, heroes, optional sample fight.'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5" aria-label="Wizard progress">
            {STEPS.map((s) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  stepIndex(s) <= stepIndex(step)
                    ? 'bg-accent'
                    : 'bg-panel-3'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {step === 'welcome' && (
            <div className="space-y-4">
              <div className="flex justify-center py-2">
                <BloomCluster size={96} />
              </div>
              <label className="block">
                <span className="section-title section-title-leaf">Campaign name</span>
                <input
                  className="field mt-1.5 w-full"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndContinue();
                  }}
                />
              </label>
              <div>
                <span className="section-title section-title-leaf">System</span>
                <div className="seg mt-1.5 grid-cols-2" role="radiogroup">
                  {(
                    [
                      ['dnd5e', 'D&D 5e'],
                      ['pf2e', 'Pathfinder 2e'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={system === id}
                      className={`seg-item ${system === id ? 'bg-panel font-semibold' : ''}`}
                      onClick={() => onSystemChange(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {system === 'pf2e' && (
                  <p className="mt-2 text-[11px] text-muted">
                    PF2e conditions and action economy are live. Spells sync
                    Player Core from Archives of Nethys. Creature catalog is
                    still homebrew / paste.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'party' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Seat your party now — they stay on the combat canvas between fights.
                Sample names are editable; clear a row or add your own.
              </p>
              <ul className="max-h-64 space-y-2 overflow-auto">
                {drafts.map((d, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 rounded-lg border border-border bg-panel-2/60 p-2"
                  >
                    <input
                      className="field py-1"
                      placeholder="Character"
                      value={d.name}
                      onChange={(e) => updateDraft(i, { name: e.target.value })}
                      aria-label={`Character name ${i + 1}`}
                    />
                    <input
                      className="field py-1"
                      placeholder="Class"
                      value={d.class}
                      onChange={(e) => updateDraft(i, { class: e.target.value })}
                      aria-label={`Class ${i + 1}`}
                    />
                    <input
                      className="field py-1"
                      placeholder="Player"
                      value={d.playerName}
                      onChange={(e) =>
                        updateDraft(i, { playerName: e.target.value })
                      }
                      aria-label={`Player ${i + 1}`}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeRow(i)}
                      aria-label={`Remove row ${i + 1}`}
                    >
                      ×
                    </button>
                    <div className="col-span-4 grid grid-cols-4 gap-1.5">
                      <label className="text-[10px] text-muted">
                        Lvl
                        <input
                          type="number"
                          className="field mt-0.5 w-full py-0.5"
                          value={d.level}
                          min={1}
                          max={20}
                          onChange={(e) =>
                            updateDraft(i, { level: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="text-[10px] text-muted">
                        AC
                        <input
                          type="number"
                          className="field mt-0.5 w-full py-0.5"
                          value={d.ac}
                          onChange={(e) =>
                            updateDraft(i, { ac: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="text-[10px] text-muted">
                        HP
                        <input
                          type="number"
                          className="field mt-0.5 w-full py-0.5"
                          value={d.maxHp}
                          onChange={(e) =>
                            updateDraft(i, { maxHp: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="text-[10px] text-muted">
                        Dex score
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="field mt-0.5 w-full py-0.5"
                          value={d.dex}
                          onChange={(e) =>
                            updateDraft(i, { dex: Number(e.target.value) })
                          }
                        />
                        <span className="mt-0.5 block font-mono-stats tabular-nums opacity-80">
                          {formatAbilityScore(d.dex)}
                        </span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={drafts.length >= 6}
                  onClick={addBlankRow}
                >
                  + Row
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    setDrafts(
                      samplePartyForSystem(system).map((d) => ({
                        ...d,
                        playerName: '',
                      })),
                    )
                  }
                >
                  Reset sample party
                </button>
              </div>

              <VineRule className="my-1" />
              <details className="text-xs">
                <summary className="cursor-pointer text-muted hover:text-text">
                  Or paste {system === 'pf2e' ? 'Pathbuilder' : 'D&D Beyond'} JSON
                </summary>
                <textarea
                  className="field mt-2 min-h-24 w-full font-mono-stats text-[11px]"
                  placeholder={
                    system === 'pf2e'
                      ? 'Paste Pathbuilder 2e export JSON…'
                      : 'Paste character JSON from …/json on a public DDB sheet…'
                  }
                  value={importPaste}
                  onChange={(e) => setImportPaste(e.target.value)}
                />
                {importError && (
                  <p className="mt-1 text-damage">{importError}</p>
                )}
                <button
                  type="button"
                  className="btn btn-sm mt-2"
                  disabled={!importPaste.trim()}
                  onClick={applyImport}
                >
                  Import character
                </button>
              </details>
            </div>
          )}

          {step === 'sample' && (
            <div className="space-y-3 text-sm">
              <p className="text-muted">
                {system === 'dnd5e'
                  ? 'Optional: seed a “Goblin ambush” (×4) into the Encounter library. Run it now to pull your party onto the tracker.'
                  : 'No bundled PF2e creatures yet — skip this step and add enemies from homebrew or the library later.'}
              </p>
              {completeDrafts.length === 0 && (
                <p className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-text">
                  No complete party rows were saved. You can still continue — add
                  players anytime under Players.
                </p>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3 text-center">
              <BloomCluster size={100} />
              <p className="text-sm font-medium text-text">You&apos;re set.</p>
              <p className="text-xs text-muted">
                {ranSample
                  ? 'Sample fight is on the tracker — roll initiative and Start combat when ready.'
                  : 'Party lives under Players. Build or run encounters from Library.'}
              </p>
              <p className="text-[11px] text-muted">
                Tip: <kbd className="chip font-mono-stats">Ctrl+K</kbd> opens the
                command palette. <kbd className="chip font-mono-stats">?</kbd> shows
                shortcuts.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (step === 'welcome') skipAll();
              else if (step === 'party') setStep('welcome');
              else if (step === 'sample') setStep('party');
              else finishOnboarding();
            }}
          >
            {step === 'welcome'
              ? forceOpen
                ? 'Cancel'
                : 'Skip for now'
              : step === 'done'
                ? 'Close'
                : 'Back'}
          </button>

          <div className="flex flex-wrap gap-2">
            {step === 'welcome' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={createAndContinue}
              >
                Continue
              </button>
            )}
            {step === 'party' && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep('sample')}
                >
                  Skip party
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={savePartyAndContinue}
                >
                  Save {completeDrafts.length || ''} &amp; continue
                </button>
              </>
            )}
            {step === 'sample' && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setStep('done')}
                >
                  Skip
                </button>
                {system === 'dnd5e' && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => seedSample(false)}
                    >
                      Save to library
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={busy}
                      onClick={() => seedSample(true)}
                    >
                      Run with party
                    </button>
                  </>
                )}
              </>
            )}
            {step === 'done' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={finishOnboarding}
              >
                Open table
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
