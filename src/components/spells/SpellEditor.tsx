import { useState } from 'react';
import { slugifyName } from '../../lib/bestiary/ids';
import { deleteHomebrewSpell, saveHomebrewSpell } from '../../lib/spells';
import type { Spell, System } from '../../types';
import { ConfirmDialog } from '../ui/AskDialog';
import { SpellPreview } from './SpellPreview';

export function SpellEditor({
  system,
  campaignId,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  system: System;
  campaignId: string;
  initial: Spell;
  onClose: () => void;
  onSaved: (spell: Spell) => void;
  onDeleted?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Spell>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (partial: Partial<Spell>) => {
    setDraft((d) => ({ ...d, ...partial, updatedAt: Date.now() }));
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
            {initial.origin === 'homebrew' && initial.name !== 'New spell'
              ? 'Edit spell'
              : 'New spell'}
          </h2>
          <div className="flex gap-1">
            {draft.origin === 'homebrew' && initial.id && (
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
                <input
                  type="number"
                  min={0}
                  max={10}
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                  value={draft.level}
                  onChange={(e) =>
                    patch({ level: Math.max(0, Number(e.target.value) || 0) })
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
            <label className="block text-xs text-muted">
              Casting time
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
                  if (system === 'pf2e') {
                    patch({
                      classes: parts,
                      pf2e: {
                        traditions: parts,
                        traits: draft.pf2e?.traits ?? [],
                        actions: draft.pf2e?.actions ?? 2,
                        heighten: draft.pf2e?.heighten,
                      },
                    });
                  } else {
                    patch({ classes: parts });
                  }
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
                    patch({
                      pf2e: {
                        traditions: draft.pf2e?.traditions ?? [],
                        traits: e.target.value
                          .split(',')
                          .map((p) => p.trim())
                          .filter(Boolean),
                        actions: draft.pf2e?.actions ?? 2,
                        heighten: draft.pf2e?.heighten,
                      },
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
