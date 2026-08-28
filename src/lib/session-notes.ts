import type { LogEntry, SessionNote } from '../types';

export function blankSessionNote(
  sessionNumber: number,
  opts?: { title?: string; body?: string },
): SessionNote {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sessionNumber,
    title: opts?.title?.trim() || `Session ${sessionNumber}`,
    body: opts?.body ?? '',
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
}

export function patchSessionNote(
  note: SessionNote,
  patch: Partial<Pick<SessionNote, 'title' | 'body' | 'pinned'>>,
): SessionNote {
  return {
    ...note,
    ...patch,
    // Allow clearing while typing; blank titles fall back at display/export time.
    title: patch.title !== undefined ? patch.title : note.title,
    updatedAt: Date.now(),
  };
}

/** Append a log line into a note body (promote from the session log). */
export function appendLogLineToNote(note: SessionNote, entry: LogEntry): SessionNote {
  const t = new Date(entry.at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const line = `• ${t} — ${entry.message}`;
  const body = note.body.trim() ? `${note.body.trimEnd()}\n${line}` : line;
  return patchSessionNote(note, { body });
}

export function sortSessionNotes(notes: SessionNote[]): SessionNote[] {
  return [...notes].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return a.pinned ? -1 : 1;
    if (b.sessionNumber !== a.sessionNumber) return b.sessionNumber - a.sessionNumber;
    return b.updatedAt - a.updatedAt;
  });
}

export function sessionNotesToMarkdown(
  notes: SessionNote[],
  opts?: { campaignName?: string },
): string {
  const header = [
    `# Session notes`,
    opts?.campaignName ? `Campaign: ${opts.campaignName}` : null,
    `Exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  if (notes.length === 0) {
    return `${header}_No session notes yet._\n`;
  }

  const blocks = sortSessionNotes(notes).map((n) => {
    const pin = n.pinned ? ' ★' : '';
    const when = new Date(n.updatedAt).toLocaleString();
    const title = n.title.trim() || `Session ${n.sessionNumber}`;
    return `## ${title}${pin}\n_Session ${n.sessionNumber} · updated ${when}_\n\n${n.body.trim() || '_Empty._'}\n`;
  });

  return `${header}${blocks.join('\n---\n\n')}\n`;
}

/**
 * Promote a log entry into the newest note for this session, creating one if
 * needed. Pure: returns the note to upsert.
 */
export function promoteLogToSessionNotes(
  notes: SessionNote[],
  sessionNumber: number,
  entry: LogEntry,
): SessionNote {
  const current = sortSessionNotes(
    notes.filter((n) => n.sessionNumber === sessionNumber),
  )[0];
  if (current) return appendLogLineToNote(current, entry);
  return appendLogLineToNote(
    blankSessionNote(sessionNumber, { title: `Session ${sessionNumber}` }),
    entry,
  );
}
