import { useEffect, useMemo, useState } from 'react';
import {
  blankSessionNote,
  patchSessionNote,
  sessionNotesToMarkdown,
  sortSessionNotes,
} from '../lib/session-notes';
import { downloadText } from '../lib/session-log';
import { selectActiveCampaign, useStore } from '../store';
import type { SessionNote } from '../types';
import { Sprig, VineRule } from './ornament/Botanical';
import { ConfirmDialog } from './ui/AskDialog';

type NotesFilter = 'current' | 'pinned' | 'all';

export function NotesPanel() {
  const campaign = useStore(selectActiveCampaign);
  const upsertSessionNote = useStore((s) => s.upsertSessionNote);
  const deleteSessionNote = useStore((s) => s.deleteSessionNote);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SessionNote | null>(null);
  const [filter, setFilter] = useState<NotesFilter>('current');

  const sessionNumber = campaign?.sessionNumber ?? 1;
  const notes = campaign?.sessionNotes ?? [];
  const pinnedCount = notes.filter((n) => n.pinned).length;

  const visible = useMemo(() => {
    const base =
      filter === 'current'
        ? notes.filter((n) => n.sessionNumber === sessionNumber)
        : filter === 'pinned'
          ? notes.filter((n) => n.pinned)
          : notes;
    return sortSessionNotes(base);
  }, [notes, filter, sessionNumber]);

  // Keep selection inside the visible list so filter changes don't leave the
  // editor pointed at a note the list is no longer showing.
  useEffect(() => {
    if (selectedId && !visible.some((n) => n.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null);
    }
  }, [visible, selectedId]);

  const selected =
    (selectedId ? visible.find((n) => n.id === selectedId) : null) ??
    visible[0] ??
    null;

  if (!campaign) {
    return (
      <p className="px-1 py-2 text-xs text-muted">
        Select a campaign to take session notes.
      </p>
    );
  }

  const createNote = () => {
    const note = blankSessionNote(sessionNumber);
    upsertSessionNote(note);
    setFilter('current');
    setSelectedId(note.id);
  };

  const exportNotes = () => {
    const md = sessionNotesToMarkdown(notes, { campaignName: campaign.name });
    downloadText(`${campaign.name}-notes.md`, md, 'text/markdown');
  };

  const emptyCopy =
    filter === 'pinned'
      ? 'No pinned notes yet. Pin a note to keep secrets, NPCs, and open threads on hand.'
      : filter === 'all'
        ? 'No notes yet. Capture beats, secrets, and open threads here.'
        : `No notes for session ${sessionNumber} yet. Capture beats, secrets, and open threads here.`;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          className="seg grid-cols-3"
          role="tablist"
          aria-label="Note filters"
        >
          {(
            [
              ['current', `S${sessionNumber}`],
              ['pinned', pinnedCount > 0 ? `Pinned (${pinnedCount})` : 'Pinned'],
              ['all', 'All'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className="seg-item"
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        Session notes and pinned campaign truths. Use + on a log line to pin it
        here — survives End session.
      </p>
      <VineRule className="my-2" />

      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" className="btn btn-sm btn-accent" onClick={createNote}>
          New note
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={notes.length === 0}
          onClick={exportNotes}
        >
          Export.md
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted">
          <Sprig />
          <span>{emptyCopy}</span>
        </p>
      ) : (
        <ul className="mb-3 max-h-40 space-y-0.5 overflow-auto text-xs">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left ${
                  selected?.id === n.id
                    ? 'bg-accent/10 text-text'
                    : 'text-muted hover:bg-panel-2 hover:text-text'
                }`}
                onClick={() => setSelectedId(n.id)}
              >
                {n.pinned && (
                  <span className="text-accent" aria-label="Pinned" title="Pinned">
                    ★
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {n.title.trim() || `Session ${n.sessionNumber}`}
                </span>
                <span className="shrink-0 font-mono-stats opacity-70">
                  S{n.sessionNumber}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
          <input
            className="field w-full py-1.5 text-sm"
            value={selected.title}
            onChange={(e) =>
              upsertSessionNote(patchSessionNote(selected, { title: e.target.value }))
            }
            aria-label="Note title"
          />
          <textarea
            className="field min-h-48 w-full flex-1 text-xs leading-relaxed"
            value={selected.body}
            placeholder="What happened, what they know, what you foreshadowed…"
            onChange={(e) =>
              upsertSessionNote(patchSessionNote(selected, { body: e.target.value }))
            }
            aria-label="Note body"
          />
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={`btn btn-sm ${selected.pinned ? 'btn-accent' : ''}`}
              onClick={() =>
                upsertSessionNote(
                  patchSessionNote(selected, { pinned: !selected.pinned }),
                )
              }
            >
              {selected.pinned ? 'Unpin' : 'Pin important'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setPendingDelete(selected)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete note?"
          message={`Delete “${pendingDelete.title.trim() || `Session ${pendingDelete.sessionNumber}`}”? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteSessionNote(pendingDelete.id);
            if (selectedId === pendingDelete.id) setSelectedId(null);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}
