import { describe, expect, it } from 'vitest';
import {
  appendLogLineToNote,
  blankSessionNote,
  patchSessionNote,
  promoteLogToSessionNotes,
  sessionNotesToMarkdown,
  sortSessionNotes,
} from './session-notes';

describe('session notes', () => {
  it('creates a blank note for the current session', () => {
    const n = blankSessionNote(4);
    expect(n.sessionNumber).toBe(4);
    expect(n.title).toBe('Session 4');
    expect(n.body).toBe('');
    expect(n.pinned).toBe(false);
  });

  it('patches body and bumps updatedAt', () => {
    const n = blankSessionNote(1, { body: 'a' });
    const next = patchSessionNote(n, { body: 'Ambush at the mill' });
    expect(next.body).toBe('Ambush at the mill');
    expect(next.updatedAt).toBeGreaterThanOrEqual(n.updatedAt);
  });

  it('allows clearing the title while editing', () => {
    const n = blankSessionNote(1, { title: 'Cold open' });
    expect(patchSessionNote(n, { title: '' }).title).toBe('');
  });

  it('promotes a log line into the body', () => {
    const n = blankSessionNote(2, { body: 'Setup' });
    const next = appendLogLineToNote(n, {
      id: '1',
      at: Date.UTC(2026, 0, 1, 20, 15),
      message: 'Goblin takes 7 damage',
      kind: 'damage',
    });
    expect(next.body).toContain('Setup');
    expect(next.body).toContain('Goblin takes 7 damage');
  });

  it('sorts pinned first, then newest session', () => {
    const a = { ...blankSessionNote(1), pinned: false, id: 'a' };
    const b = { ...blankSessionNote(3), pinned: true, id: 'b' };
    const c = { ...blankSessionNote(2), pinned: false, id: 'c' };
    expect(sortSessionNotes([a, b, c]).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('exports markdown', () => {
    const md = sessionNotesToMarkdown(
      [blankSessionNote(1, { title: 'Cold open', body: 'Fog rolls in.' })],
      { campaignName: 'Strahd' },
    );
    expect(md).toContain('Campaign: Strahd');
    expect(md).toContain('## Cold open');
    expect(md).toContain('Fog rolls in.');
  });

  it('promotes a log line into a new or existing session note', () => {
    const entry = {
      id: '1',
      at: Date.UTC(2026, 0, 1, 20, 15),
      message: 'Goblin takes 7 damage',
      kind: 'damage' as const,
    };
    const created = promoteLogToSessionNotes([], 2, entry);
    expect(created.sessionNumber).toBe(2);
    expect(created.body).toContain('Goblin takes 7 damage');

    const again = promoteLogToSessionNotes([created], 2, {
      ...entry,
      id: '2',
      message: 'Kaelen heals 4',
    });
    expect(again.id).toBe(created.id);
    expect(again.body).toContain('Kaelen heals 4');
  });
});
