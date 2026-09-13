import { useEffect, useState } from 'react';
import { slugifyName } from '../../lib/bestiary/ids';
import { deleteHomebrewSpell, saveHomebrewSpell } from '../../lib/spells';
import {
  actionCostGlyph,
  actionCostLabel,
  castTimeLabel,
  isPlainActionCastTime,
  type ActionCost,
} from '../../lib/pf2e-actions';
import type { Spell, System } from '../../types';
import { ConfirmDialog } from '../ui/AskDialog';
import { SpellPreview } from './SpellPreview';
import { NumberField } from '../ui/NumberField';

/** The five casts PF2e recognises, in the order the books print them. */
const ACTION_COSTS: ActionCost[] = [1, 2, 3, 'reaction', 'free'];

export function SpellEditor({
  system,
  campaignId,
  initial,
  mode,
  onClose,
  onSaved,
  onDeleted,
}: {
  system: System;
  campaignId: string;
  initial: Spell;
  /** Defaults to 'edit' for a saved homebrew spell, 'new' otherwise. */
  mode?: 'new' | 'edit';
  onClose: () => void;
  onSaved: (spell: Spell) => void;
  onDeleted?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Spell>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing =
    (mode ??
      (initial.origin === 'homebrew' && initial.name !== 'New spell'
        ? 'edit'
        : 'new')) === 'edit';

  // Capture Escape: this dialog can sit on top of the creature editor, whose
  // own Escape handler would otherwise close the sheet underneath us.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (confirmDelete) setConfirmDelete(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmDelete, onClose]);

  const patch = (partial: Partial<Spell>) => {
    setDraft((d) => ({ ...d, ...partial, updatedAt: Date.now() }));
  };

  /**
   * Patch the PF2e block without losing the fields you are not editing.
   *
   * Every caller used to rebuild the whole object inline, which meant each one
   * had to remember to carry `actions` across — and since nothing in the form
   * ever set it, every edit quietly reset the cast to two actions.
   */
  const patchPf2e = (partial: Partial<NonNullable<Spell['pf2e']>>) => {
    setDraft((d) => ({
      ...d,
      pf2e: {
        traditions: d.pf2e?.traditions ?? d.classes,
        traits: d.pf2e?.traits ?? [],
        actions: d.pf2e?.actions ?? 2,
        heighten: d.pf2e?.heighten,
        damage: d.pf2e?.damage,
        ...partial,
      },
      updatedAt: Date.now(),
    }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveHomebrewSpell({
        ...draft,
        name: draft.name.trim(),
        slug: slugifyName(draft.name),
        campaignId,
        system,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="my-4 w-full max-w-4xl card overflow-hidden shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold text-text">
            {editing ? 'Edit spell' : 'New spell'}
          </h2>
          <div className="flex gap-1">
            {editing && draft.origin === 'homebrew' && initial.id && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>

        {error && <p className="px-3 py-1.5 text-xs text-damage">{error}</p>}

        <div className="grid gap-0 lg:grid-cols-2">
          <div className="space-y-2 p-3 text-sm">
            <label className="block text-xs text-muted">
              Name
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                {system === 'pf2e' ? 'Rank (0 = cantrip)' : 'Level (0 = cantrip)'}
                <NumberField
                  min={0}
                  max={10}
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                  value={draft.level}
                  onChange={(n) =>
                    patch({ level: Math.max(0, n) })
                  }
                />
              </label>
              <label className="block text-xs text-muted">
                School
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                  value={draft.school}
                  onChange={(e) => patch({ school: e.target.value })}
                />
              </label>
            </div>
            {system === 'pf2e' && (
              <fieldset className="block text-xs text-muted">
                <legend>Cast</legend>
                <div
                  className="mt-0.5 flex flex-wrap gap-1"
                  role="radiogroup"
                  aria-label="Action cost"
                >
                  {ACTION_COSTS.map((cost) => {
                    const on = (draft.pf2e?.actions ?? 2) === cost;
                    return (
                      <button
                        key={String(cost)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={actionCostLabel(cost)}
                        className={`pip font-mono-stats ${on ? 'pip-on' : ''}`}
                        onClick={() => {
                          patchPf2e({ actions: cost });
                          // Keep the cast-time line in step, but never trample
                          // a real one — a ritual's "1 minute" is not a glyph.
                          if (isPlainActionCastTime(draft.castingTime)) {
                            patch({ castingTime: castTimeLabel(cost) });
                          }
                        }}
                      >
                        <span className={on ? 'text-accent' : ''} aria-hidden>
                          {actionCostGlyph(cost)}
                        </span>
                        <span className="ml-1 font-sans text-[10px]">
                          {actionCostLabel(cost)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <label className="block text-xs text-muted">
              {system === 'pf2e' ? 'Cast time (rituals, long casts)' : 'Casting time'}
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={draft.castingTime}
                onChange={(e) => patch({ castingTime: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted">
              Range
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={draft.range}
                onChange={(e) => patch({ range: e.target.value })}
              />
            </label>
            {system === 'dnd5e' && (
              <label className="block text-xs text-muted">
                Components
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                  value={draft.components}
                  onChange={(e) => patch({ components: e.target.value })}
                />
              </label>
            )}
            <label className="block text-xs text-muted">
              Duration
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={draft.duration}
                onChange={(e) => patch({ duration: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted">
              {system === 'pf2e' ? 'Traditions (comma)' : 'Class lists (comma)'}
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={
                  system === 'pf2e'
                    ? (draft.pf2e?.traditions ?? draft.classes).join(', ')
                    : draft.classes.join(', ')
                }
                onChange={(e) => {
                  const parts = e.target.value
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean);
                  patch({ classes: parts });
                  if (system === 'pf2e') patchPf2e({ traditions: parts });
                }}
              />
            </label>
            {system === 'pf2e' && (
              <label className="block text-xs text-muted">
                Traits (comma)
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                  value={(draft.pf2e?.traits ?? []).join(', ')}
                  onChange={(e) =>
                    patchPf2e({
                      traits: e.target.value
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={Boolean(draft.concentration)}
                onChange={(e) => patch({ concentration: e.target.checked })}
              />
              Concentration
            </label>
            <label className="block text-xs text-muted">
              Description
              <textarea
                className="mt-0.5 min-h-[140px] w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                value={draft.desc}
                onChange={(e) => patch({ desc: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted">
              {system === 'pf2e' ? 'Heightened' : 'At higher levels'}
              <textarea
                className="mt-0.5 min-h-[60px] w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
                value={draft.higherLevel ?? ''}
                onChange={(e) =>
                  patch({ higherLevel: e.target.value || undefined })
                }
              />
            </label>
          </div>
          <div className="border-t border-border p-3 lg:border-l lg:border-t-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Preview
            </h3>
            <SpellPreview spell={draft} />
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete spell?"
          message={`Delete “${draft.name}”? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void (async () => {
              await deleteHomebrewSpell(draft.id);
              onDeleted?.(draft.id);
              onClose();
            })();
          }}
        />
      )}
    </div>
  );
}
