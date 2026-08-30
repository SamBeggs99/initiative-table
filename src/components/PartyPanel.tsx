import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { parseDamageField, applyTempHp } from '../lib/combat';
import { hueHex, pcHueId } from '../lib/identity';
import { importDdbJson } from '../lib/import/ddb';
import { importPathbuilderJson } from '../lib/import/pathbuilder';
import { formatAbilityScore } from '../lib/statblock-derived';
import {
  applyGearChange,
  applySheetPatch,
  blankPartyMember,
  formatLevelEntry,
  partyDisplayedHeroPoints,
  partyDisplayedHp,
  proficiencyBonusForLevel,
  spellSlotsFromClassTable,
} from '../lib/party';
import { useStore } from '../store';
import type { PartyMember } from '../types';
import { emptySpellSlots } from '../types';
import { Sprig } from './ornament/Botanical';
import { ConfirmDialog } from './ui/AskDialog';
import { HeroPointPips } from './combat/HeroPointPips';
import { PortraitField, PortraitThumb } from './ui/Portrait';

function PartyHpField({
  memberId,
  compact,
}: {
  memberId: string;
  compact?: boolean;
}) {
  const [dmg, setDmg] = useState('');
  const applyPartyHpAdjust = useStore((s) => s.applyPartyHpAdjust);
  const member = useStore(
    (s) => s.getActiveCampaign()?.party.find((p) => p.id === memberId) ?? null,
  );
  const combatants = useStore((s) => s.getActiveCombat().combatants);
  const liveTemp = member ? partyDisplayedHp(member, combatants).tempHp : 0;

  const submit = (heal: boolean) => {
    const parsed = parseDamageField(dmg);
    if (!parsed) return;
    if (parsed.kind === 'temp') {
      applyPartyHpAdjust(
        memberId,
        'temp',
        applyTempHp(liveTemp, parsed.amount, parsed.tempOp ?? 'set'),
      );
    } else if (heal || parsed.kind === 'heal')
      applyPartyHpAdjust(memberId, 'heal', parsed.amount);
    else applyPartyHpAdjust(memberId, 'damage', parsed.amount);
    setDmg('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(e.shiftKey);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`field font-mono-stats tabular-nums text-text ${
        compact ? 'w-14 py-0.5 text-[11px]' : 'w-20 py-1 text-xs'
      }`}
      placeholder="dmg"
      title="12 or -12 = damage · +12 or h12 = heal (max HP) · *5 add temp"
      value={dmg}
      onChange={(e) => setDmg(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      aria-label="Adjust HP"
    />
  );
}

function LiveHpEditor({ member }: { member: PartyMember }) {
  const combatants = useStore((s) => s.getActiveCombat().combatants);
  const combatStarted = useStore((s) => s.getActiveCombat().started);
  const patchPartyLive = useStore((s) => s.patchPartyLive);
  const live = partyDisplayedHp(member, combatants);

  return (
    <div className="mb-2 rounded border border-border/80 bg-panel-2/60 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="font-mono-stats text-sm tabular-nums">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Live HP
          </span>
          <span
            className={`ml-1.5 font-semibold ${
              live.currentHp <= live.maxHp / 2 ? 'text-amber' : 'text-heal'
            }`}
          >
            {live.currentHp}/{live.maxHp}
            {live.tempHp > 0 ? ` (+${live.tempHp})` : ''}
          </span>
          {live.inCombat && combatStarted && (
            <span className="ml-1.5 text-[10px] text-condition">in combat</span>
          )}
        </div>
        <PartyHpField memberId={member.id} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-muted">Current</span>
          <input
            type="number"
            min={0}
            max={live.maxHp}
            className="mt-0.5 w-full rounded border border-border bg-panel px-2 py-1 font-mono-stats text-xs tabular-nums text-text"
            value={live.currentHp}
            onChange={(e) =>
              patchPartyLive(member.id, {
                currentHp: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-muted">Temp</span>
          <input
            type="number"
            min={0}
            className="mt-0.5 w-full rounded border border-border bg-panel px-2 py-1 font-mono-stats text-xs tabular-nums text-text"
            value={live.tempHp}
            onChange={(e) =>
              patchPartyLive(member.id, {
                tempHp: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
      </div>
      <p className="mt-1 text-[10px] text-muted">
        12 or -12 damage · +12 or h12 heal (never over max) · *5 add temp. Sheet
        max HP stays under Edit sheet.
      </p>
    </div>
  );
}

function PartyHeroPoints({
  member,
  compact,
}: {
  member: PartyMember;
  compact?: boolean;
}) {
  const combatants = useStore((s) => s.getActiveCombat().combatants);
  const patchPartyLive = useStore((s) => s.patchPartyLive);
  const value = partyDisplayedHeroPoints(member, combatants);
  return (
    <HeroPointPips
      value={value}
      compact={compact}
      onChange={(next) => patchPartyLive(member.id, { heroPoints: next })}
    />
  );
}

function SpellSlotMaxEditor({
  member,
  onChange,
  showFill,
}: {
  member: PartyMember;
  onChange: (slots: PartyMember['spellSlots']) => void;
  showFill: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Spell slot maxima (1–9)</span>
        {showFill && (
          <button
            type="button"
            className="text-[11px] text-accent"
            onClick={() =>
              onChange(spellSlotsFromClassTable(member.class, member.level))
            }
          >
            Fill from class table
          </button>
        )}
      </div>
      <div className="grid grid-cols-9 gap-1">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => (
          <label key={lvl} className="block text-center">
            <span className="text-[10px] text-muted">{lvl}</span>
            <input
              type="number"
              min={0}
              max={20}
              className="w-full rounded border border-border bg-panel-2 px-0.5 py-0.5 text-center font-mono-stats text-xs tabular-nums text-text"
              value={member.spellSlots[lvl]?.max ?? 0}
              onChange={(e) => {
                const max = Math.max(0, Number(e.target.value) || 0);
                const prev = member.spellSlots[lvl] ?? { max: 0, used: 0 };
                onChange({
                  ...member.spellSlots,
                  [lvl]: { max, used: Math.min(prev.used, max) },
                });
              }}
            />
          </label>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        Used counts are live-only — edit them in combat, not here.
      </p>
    </div>
  );
}

function LevelUpDialog({
  member,
  onClose,
  onSave,
}: {
  member: PartyMember;
  onClose: () => void;
  onSave: (input: {
    acAfter: number;
    maxHpAfter: number;
    note?: string;
    healToFull: boolean;
    updateSlots: boolean;
  }) => void;
}) {
  const [acAfter, setAcAfter] = useState(member.ac);
  const [maxHpAfter, setMaxHpAfter] = useState(member.maxHp);
  const [note, setNote] = useState('');
  const [healToFull, setHealToFull] = useState(true);
  const [updateSlots, setUpdateSlots] = useState(true);
  const nextLevel = member.level + 1;
  const pb = proficiencyBonusForLevel(nextLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-8 w-full max-w-sm card p-4 shadow-2xl">
        <h3 className="mb-1 text-sm font-semibold text-text">
          Level up — {member.name}
        </h3>
        <p className="mb-3 text-xs text-muted">
          L{member.level} → L{nextLevel} · proficiency bonus becomes +{pb}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="block">
            <span className="text-xs text-muted">AC</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={acAfter}
              onChange={(e) => setAcAfter(Number(e.target.value) || 0)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Max HP</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={maxHpAfter}
              onChange={(e) => setMaxHpAfter(Number(e.target.value) || 1)}
            />
          </label>
        </div>
        <label className="mt-2 block text-sm">
          <span className="text-xs text-muted">Note</span>
          <input
            className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ASI, subclass, feat…"
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={healToFull}
            onChange={(e) => setHealToFull(e.target.checked)}
          />
          Heal to new max HP
        </label>
        <label className="mt-1 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={updateSlots}
            onChange={(e) => setUpdateSlots(e.target.checked)}
          />
          Prefill spell slot maxima for L{nextLevel} (overridable after)
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onSave({
                acAfter,
                maxHpAfter,
                note: note.trim() || undefined,
                healToFull,
                updateSlots,
              })
            }
          >
            Confirm level-up
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetForm({
  member,
  system,
  onSave,
  onCancel,
}: {
  member: PartyMember;
  system: 'dnd5e' | 'pf2e';
  onSave: (m: PartyMember) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(member));

  const setSheet = (patch: Parameters<typeof applySheetPatch>[1]) => {
    setDraft((d) => applySheetPatch(d, patch));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-4 w-full max-w-lg card p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Character sheet</h3>
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Sheet only — not live
          </span>
        </div>
        <p className="mb-3 text-[11px] text-muted">
          AC, max HP, and slot maxima change here or via Level up. Combat never
          writes these fields.
        </p>

          <PortraitField
            value={draft.portraitDataUrl}
            onChange={(portraitDataUrl) =>
              setSheet({ portraitDataUrl: portraitDataUrl ?? '' })
            }
          />

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="col-span-2 block">
            <span className="text-xs text-muted">Name</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={draft.name}
              onChange={(e) => setSheet({ name: e.target.value })}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Player</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={draft.playerName}
              onChange={(e) => setSheet({ playerName: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Level</span>
            <input
              type="number"
              min={1}
              max={20}
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.level}
              onChange={(e) =>
                setSheet({ level: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Class</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={draft.class}
              onChange={(e) => setSheet({ class: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Ancestry / Race</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={draft.ancestry}
              onChange={(e) => setSheet({ ancestry: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">AC (gear OK)</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.ac}
              onChange={(e) =>
                setDraft((d) => applyGearChange(d, { ac: Number(e.target.value) || 0 }))
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Max HP (gear OK)</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.maxHp}
              onChange={(e) =>
                setDraft((d) =>
                  applyGearChange(d, { maxHp: Number(e.target.value) || 1 }),
                )
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Dex score</span>
            <input
              type="number"
              min={1}
              max={30}
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.dex}
              onChange={(e) => setSheet({ dex: Number(e.target.value) || 10 })}
            />
            <span className="mt-0.5 block font-mono-stats text-[10px] tabular-nums text-muted">
              {formatAbilityScore(draft.dex)} — same formula for 5e and PF2e
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Passive Perception</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.passivePerception}
              onChange={(e) =>
                setSheet({ passivePerception: Number(e.target.value) || 10 })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Passive Investigation</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.passiveInvestigation}
              onChange={(e) =>
                setSheet({ passiveInvestigation: Number(e.target.value) || 10 })
              }
            />
          </label>
        </div>

        {system === 'dnd5e' && (
          <div className="mt-3">
            <SpellSlotMaxEditor
              member={draft}
              showFill
              onChange={(spellSlots) => setDraft((d) => ({ ...d, spellSlots }))}
            />
          </div>
        )}

        {system === 'pf2e' && draft.focusPoints && (
          <label className="mt-3 block text-sm">
            <span className="text-xs text-muted">Focus points max</span>
            <input
              type="number"
              min={0}
              className="mt-0.5 w-24 rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
              value={draft.focusPoints.max}
              onChange={(e) =>
                setSheet({ focusPointsMax: Number(e.target.value) || 0 })
              }
            />
          </label>
        )}

        <label className="mt-3 block text-sm">
          <span className="text-xs text-muted">Notes</span>
          <textarea
            className="mt-0.5 min-h-[64px] w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
            value={draft.notes}
            onChange={(e) => setSheet({ notes: e.target.value })}
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(draft)}
          >
            Save sheet
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({
  kind,
  campaignId,
  onClose,
  onCommit,
}: {
  kind: 'ddb' | 'pathbuilder';
  campaignId: string;
  onClose: () => void;
  onCommit: (member: PartyMember) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{
    member: PartyMember;
    warnings: string[];
    unreadFields: string[];
  } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-4 w-full max-w-lg card p-4 shadow-2xl">
        <h3 className="mb-2 text-sm font-semibold text-text">
          {kind === 'ddb' ? 'Import D&D Beyond (paste)' : 'Import Pathbuilder 2e'}
        </h3>
        {kind === 'ddb' ? (
          <div className="mb-3 space-y-1 text-xs text-muted">
            <p>
              D&D Beyond has no public API. Do not use scrapers or auto-fetch —
              they hit rate limits and ToS 2.2.
            </p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Open the character’s public sheet on D&D Beyond</li>
              <li>Append <code className="text-text">/json</code> to the URL</li>
              <li>Copy the JSON and paste it below</li>
            </ol>
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted">
            In Pathbuilder 2e: Export → JSON, then paste the file contents here.
          </p>
        )}

        {!review ? (
          <>
            <textarea
              className="min-h-[180px] w-full rounded border border-border bg-panel-2 px-2 py-1.5 font-mono text-xs text-text"
              placeholder="Paste JSON…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-damage">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setError(null);
                  if (kind === 'ddb') {
                    const result = importDdbJson(text, campaignId);
                    if (!result.ok) {
                      setError(
                        `${result.error}${
                          result.unreadFields.length
                            ? ` (unread: ${result.unreadFields.slice(0, 6).join(', ')})`
                            : ''
                        }`,
                      );
                      return;
                    }
                    setReview({
                      member: {
                        ...result.member,
                        id: crypto.randomUUID(),
                        campaignId,
                      },
                      warnings: result.warnings,
                      unreadFields: result.unreadFields,
                    });
                    return;
                  }
                  const result = importPathbuilderJson(text, campaignId);
                  if (!result.ok) {
                    setError(
                      `${result.error}${
                        result.unreadFields.length
                          ? ` (unread: ${result.unreadFields.slice(0, 6).join(', ')})`
                          : ''
                      }`,
                    );
                    return;
                  }
                  setReview({
                    member: result.member,
                    warnings: result.warnings,
                    unreadFields: result.unreadFields,
                  });
                }}
              >
                Review
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 space-y-1 rounded border border-border bg-panel-2 p-2 text-xs">
              <p className="font-semibold text-text">{review.member.name}</p>
              <p className="text-muted">
                L{review.member.level} {review.member.class} · AC {review.member.ac} ·
                HP {review.member.currentHp}/{review.member.maxHp} · Dex{' '}
                {formatAbilityScore(review.member.dex)}
              </p>
              <p className="text-muted">
                PP {review.member.passivePerception} · PI{' '}
                {review.member.passiveInvestigation}
              </p>
            </div>
            {(review.warnings.length > 0 || review.unreadFields.length > 0) && (
              <div className="mb-3 space-y-1 rounded border border-condition/40 bg-panel-2 p-2 text-xs text-condition">
                <p className="font-semibold">Could not fully read</p>
                {review.unreadFields.map((f) => (
                  <p key={f}>• {f}</p>
                ))}
                {review.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <p className="text-muted">
                  Fix these in the sheet form after import — nothing was guessed
                  silently.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReview(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onCommit(review.member)}
              >
                Add to party
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MemberDetail({
  member,
  system,
  onEditSheet,
  onLevelUp,
  onCombat,
  onDelete,
  onClose,
}: {
  member: PartyMember;
  system: 'dnd5e' | 'pf2e';
  onEditSheet: () => void;
  onLevelUp: () => void;
  onCombat: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const logLines = useMemo(() => {
    let prev = 0;
    return member.levelLog.map((e) => {
      const line = formatLevelEntry(e, prev || e.level - 1);
      prev = e.level;
      return line;
    });
  }, [member.levelLog]);

  const liveSlots = Object.entries(member.spellSlots)
    .filter(([, s]) => s.max > 0)
    .map(([lvl, s]) => `L${lvl} ${s.used}/${s.max}`)
    .join(' · ');

  return (
    <div
      className="card p-2.5 text-xs"
      style={{ '--identity': hueHex(pcHueId(member.class, member.name)) } as CSSProperties}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <PortraitThumb src={member.portraitDataUrl} alt="" size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {!member.portraitDataUrl && (
                <span className="identity-dot" aria-hidden />
              )}
              <span className="name-identity text-sm font-semibold">
                {member.name}
              </span>
            </div>
            <div className="text-muted">
              Character · L{member.level}{' '}
              <span className="name-identity font-medium">{member.class}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-accent">
              Player · {member.playerName || 'Not assigned'}
            </div>
          </div>
        </div>
        <button type="button" className="text-muted hover:text-text" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono-stats tabular-nums">
        <div>
          <span className="text-muted">Sheet AC </span>
          <span className="text-text">{member.ac}</span>
        </div>
        <div>
          <span className="text-muted">PP/PI </span>
          <span className="text-text">
            {member.passivePerception}/{member.passiveInvestigation}
          </span>
        </div>
        {system === 'dnd5e' && (
          <div className="col-span-2">
            <span className="text-muted">Slots </span>
            <span className="text-text">{liveSlots || '—'}</span>
          </div>
        )}
      </div>

      <LiveHpEditor member={member} />
      {system === 'pf2e' && <PartyHeroPoints member={member} />}

      {logLines.length > 0 && (
        <div className="mb-2">
          <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted">
            Level log
          </div>
          <ul className="space-y-0.5 text-[11px] text-muted">
            {logLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn btn-sm"
          onClick={onEditSheet}
        >
          Edit sheet
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onLevelUp}
        >
          Level up
        </button>
        <button
          type="button"
          className="btn btn-sm btn-accent"
          onClick={onCombat}
        >
          To combat
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] text-muted hover:text-damage"
          onClick={onDelete}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function PartyPanel() {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const combatants = useStore((s) => s.getActiveCombat().combatants);
  const combatStarted = useStore((s) => s.getActiveCombat().started);
  const upsertPartyMember = useStore((s) => s.upsertPartyMember);
  const deletePartyMember = useStore((s) => s.deletePartyMember);
  const levelUpPartyMember = useStore((s) => s.levelUpPartyMember);
  const addPartyMemberToCombat = useStore((s) => s.addPartyMemberToCombat);
  const addWholePartyToCombat = useStore((s) => s.addWholePartyToCombat);
  const shortRest = useStore((s) => s.shortRest);
  const longRest = useStore((s) => s.longRest);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetEdit, setSheetEdit] = useState<PartyMember | null>(null);
  const [levelUpId, setLevelUpId] = useState<string | null>(null);
  const [importKind, setImportKind] = useState<'ddb' | 'pathbuilder' | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  if (!campaign) return null;

  const selected = selectedId
    ? campaign.party.find((p) => p.id === selectedId) ?? null
    : null;

  const levelUpMember = levelUpId
    ? campaign.party.find((p) => p.id === levelUpId)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSheetEdit(
              blankPartyMember(campaign.id, { system: campaign.system }),
            );
          }}
        >
          Add player character
        </button>
        {campaign.system === 'dnd5e' ? (
          <button
            type="button"
            className="btn"
            onClick={() => setImportKind('ddb')}
          >
            DDB paste
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => setImportKind('pathbuilder')}
          >
            Pathbuilder
          </button>
        )}
        <button
          type="button"
          disabled={campaign.party.length === 0}
          className="btn btn-accent"
          onClick={addWholePartyToCombat}
        >
          All to combat
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={shortRest}
        >
          Short rest
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={longRest}
        >
          Long rest
        </button>
      </div>

      {campaign.party.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px] text-muted">
          <span className="section-title mr-1">Class colours</span>
          {campaign.party.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1"
              style={
                {
                  '--identity': hueHex(pcHueId(p.class, p.name)),
                } as CSSProperties
              }
            >
              <span className="identity-dot" aria-hidden />
              <span className="name-identity font-medium">
                {p.class || p.name}
              </span>
            </span>
          ))}
        </div>
      )}

      <ul className="max-h-48 space-y-0.5 overflow-auto text-sm">
        {campaign.party.length === 0 ? (
          <li className="flex items-center gap-2 rounded border border-dashed border-border p-3 text-xs text-muted">
            <Sprig />
            No player characters yet. Add a sheet manually or import a character.
          </li>
        ) : (
          campaign.party.map((p) => {
            const live = partyDisplayedHp(p, combatants);
            return (
              <li key={p.id}>
                <div
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                    selected?.id === p.id
                      ? 'border-accent/50 bg-accent/10 text-text'
                      : 'border-transparent text-text hover:border-border hover:bg-panel-2'
                  }`}
                  style={
                    {
                      '--identity': hueHex(pcHueId(p.class, p.name)),
                    } as CSSProperties
                  }
                >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setSelectedId(p.id)}
                    >
                      {p.portraitDataUrl ? (
                        <PortraitThumb src={p.portraitDataUrl} alt="" size="xs" />
                      ) : (
                        <span
                          className="identity-dot"
                          aria-hidden
                          title={p.class || undefined}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="name-identity block truncate font-semibold">
                          {p.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted">
                          {p.playerName || 'Player not assigned'}
                          {live.inCombat && combatStarted ? ' · fighting' : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-mono-stats text-[10px] tabular-nums">
                        <span className="block text-muted">L{p.level}</span>
                        <span
                          className={`block font-semibold ${
                            live.currentHp <= live.maxHp / 2
                              ? 'text-amber'
                              : 'text-heal'
                          }`}
                        >
                          {live.currentHp}/{live.maxHp}
                          {live.tempHp > 0 ? `+${live.tempHp}` : ''}
                        </span>
                      </span>
                    </button>
                  {campaign.system === 'pf2e' && (
                    <PartyHeroPoints member={p} compact />
                  )}
                  <PartyHpField memberId={p.id} compact />
                </div>
              </li>
            );
          })
        )}
      </ul>

      {selected && (
        <MemberDetail
          member={selected}
          system={campaign.system}
          onClose={() => setSelectedId(null)}
          onEditSheet={() => setSheetEdit(selected)}
          onLevelUp={() => setLevelUpId(selected.id)}
          onCombat={() => addPartyMemberToCombat(selected.id)}
          onDelete={() => setPendingDelete(true)}
        />
      )}

      {pendingDelete && selected && (
        <ConfirmDialog
          title="Remove character?"
          message={`Remove ${selected.name} from the party?`}
          confirmLabel="Remove"
          danger
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => {
            deletePartyMember(selected.id);
            setSelectedId(null);
            setPendingDelete(false);
          }}
        />
      )}

      {sheetEdit && (
        <SheetForm
          member={sheetEdit}
          system={campaign.system}
          onCancel={() => setSheetEdit(null)}
          onSave={(m) => {
            upsertPartyMember(m);
            setSelectedId(m.id);
            setSheetEdit(null);
          }}
        />
      )}

      {levelUpMember && (
        <LevelUpDialog
          member={levelUpMember}
          onClose={() => setLevelUpId(null)}
          onSave={({ acAfter, maxHpAfter, note, healToFull, updateSlots }) => {
            levelUpPartyMember(levelUpMember.id, {
              acAfter,
              maxHpAfter,
              note,
              healToFull,
            });
            if (updateSlots && campaign.system === 'dnd5e') {
              const after = useStore
                .getState()
                .getActiveCampaign()
                ?.party.find((p) => p.id === levelUpMember.id);
              if (after) {
                const filled = spellSlotsFromClassTable(after.class, after.level);
                // Preserve used counts where possible
                const merged = emptySpellSlots();
                for (let lvl = 1; lvl <= 9; lvl++) {
                  const max = filled[lvl]?.max ?? 0;
                  const used = Math.min(after.spellSlots[lvl]?.used ?? 0, max);
                  merged[lvl] = { max, used };
                }
                upsertPartyMember({ ...after, spellSlots: merged });
              }
            }
            setLevelUpId(null);
          }}
        />
      )}

      {importKind && (
        <ImportDialog
          kind={importKind}
          campaignId={campaign.id}
          onClose={() => setImportKind(null)}
          onCommit={(member) => {
            upsertPartyMember(member);
            setSelectedId(member.id);
            setImportKind(null);
            setSheetEdit(member);
          }}
        />
      )}
    </div>
  );
}
