import type { EncounterLootLine, LogEntry, SessionNote } from '../types';
import { blankSessionNote, patchSessionNote, sortSessionNotes } from './session-notes';

export type LootKind = EncounterLootLine['kind'];

export function blankLootLine(
  text = '',
  opts?: { kind?: LootKind; boss?: boolean },
): EncounterLootLine {
  return {
    id: crypto.randomUUID(),
    text,
    kind: opts?.kind ?? 'treasure',
    boss: opts?.boss ?? false,
  };
}

/** Drop awarded flags and blank rows when storing on a library encounter. */
export function lootForLibrary(
  lines: EncounterLootLine[] | undefined,
): EncounterLootLine[] {
  return (lines ?? [])
    .map((l) => ({
      id: l.id || crypto.randomUUID(),
      text: l.text ?? '',
      kind: l.kind ?? 'treasure',
      boss: !!l.boss,
    }))
    .filter((l) => l.text.trim().length > 0);
}

/** Reset award state when an encounter pack hits the tape. */
export function activateLootForCombat(
  lines: EncounterLootLine[] | undefined,
): EncounterLootLine[] {
  return lootForLibrary(lines).map((l) => ({ ...l, awarded: false }));
}

export function pendingLoot(lines: EncounterLootLine[] | undefined): EncounterLootLine[] {
  return (lines ?? []).filter((l) => l.text.trim() && !l.awarded);
}

/** Awarded lines live in Notes — drop them from the live fight canvas. */
export function stripAwardedLoot(
  lines: EncounterLootLine[] | undefined,
): EncounterLootLine[] {
  return (lines ?? []).filter((l) => l.text.trim() && !l.awarded);
}

export function markLootAwarded(
  lines: EncounterLootLine[],
  id: string,
): EncounterLootLine[] {
  return lines.map((l) => (l.id === id ? { ...l, awarded: true } : l));
}

export function markAllLootAwarded(lines: EncounterLootLine[]): EncounterLootLine[] {
  return lines.map((l) =>
    l.text.trim() ? { ...l, awarded: true } : l,
  );
}

export function lootKindLabel(kind: LootKind | undefined): string {
  if (kind === 'item') return 'Item';
  if (kind === 'other') return 'Other';
  return 'Treasure';
}

export function formatLootAwardLog(
  line: EncounterLootLine,
  encounterName?: string,
): string {
  const tag = line.boss ? 'Boss loot' : lootKindLabel(line.kind);
  const where = encounterName ? ` (${encounterName})` : '';
  return `Awarded ${tag}${where}: ${line.text.trim()}`;
}

export function lootLinesToNoteBody(
  lines: EncounterLootLine[],
  encounterName: string,
): string {
  const header = `Loot — ${encounterName}`;
  const bullets = lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const bits = [
        l.boss ? 'boss' : null,
        lootKindLabel(l.kind).toLowerCase(),
      ].filter(Boolean);
      return `• ${l.text.trim()}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    });
  return [header, ...bullets].join('\n');
}

/**
 * Append awarded loot into a session note titled for this encounter, creating
 * one if needed. Pure — returns the note to upsert.
 */
export function appendLootToSessionNotes(
  notes: SessionNote[],
  sessionNumber: number,
  encounterName: string,
  lines: EncounterLootLine[],
): SessionNote {
  const title = `Loot — ${encounterName}`;
  const existing = sortSessionNotes(
    notes.filter(
      (n) =>
        n.sessionNumber === sessionNumber &&
        n.title.trim().toLowerCase() === title.toLowerCase(),
    ),
  )[0];

  const block = lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const t = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      const tag = l.boss ? 'boss' : lootKindLabel(l.kind).toLowerCase();
      return `• ${t} — ${l.text.trim()} (${tag})`;
    })
    .join('\n');

  if (!block) {
    return existing ?? blankSessionNote(sessionNumber, { title });
  }

  if (existing) {
    const body = existing.body.trim()
      ? `${existing.body.trimEnd()}\n${block}`
      : block;
    return patchSessionNote(existing, { body, pinned: true });
  }

  return {
    ...blankSessionNote(sessionNumber, {
      title,
      body: block,
    }),
    pinned: true,
  };
}

/** Convenience for log kind when pushing loot awards. */
export function lootLogKind(): LogEntry['kind'] {
  return 'system';
}
