import { describe, expect, it } from 'vitest';
import {
  activateLootForCombat,
  appendLootToSessionNotes,
  blankLootLine,
  formatLootAwardLog,
  lootForLibrary,
  markAllLootAwarded,
  markLootAwarded,
  pendingLoot,
  stripAwardedLoot,
} from './loot';

describe('loot helpers', () => {
  it('drops blank lines when saving to the library', () => {
    const lines = [
      blankLootLine('400 gp'),
      blankLootLine('   '),
      { ...blankLootLine('Circlet'), awarded: true, boss: true },
    ];
    const saved = lootForLibrary(lines);
    expect(saved).toHaveLength(2);
    expect(saved[0]!.text).toBe('400 gp');
    expect(saved[1]!.boss).toBe(true);
    expect(saved[1]!.awarded).toBeUndefined();
  });

  it('resets awarded when activating for combat', () => {
    const live = activateLootForCombat([
      { ...blankLootLine('Key'), awarded: true },
    ]);
    expect(live[0]!.awarded).toBe(false);
    expect(pendingLoot(live)).toHaveLength(1);
  });

  it('marks lines awarded one at a time or all at once', () => {
    const a = blankLootLine('a');
    const b = blankLootLine('b');
    const one = markLootAwarded([a, b], a.id);
    expect(one.find((l) => l.id === a.id)?.awarded).toBe(true);
    expect(pendingLoot(one)).toHaveLength(1);
    expect(pendingLoot(markAllLootAwarded(one))).toHaveLength(0);
  });

  it('strips awarded lines off the live canvas', () => {
    const a = { ...blankLootLine('a'), awarded: true };
    const b = blankLootLine('b');
    expect(stripAwardedLoot([a, b]).map((l) => l.text)).toEqual(['b']);
    expect(stripAwardedLoot([a])).toEqual([]);
  });

  it('formats award logs and pins a session loot note', () => {
    const line = { ...blankLootLine('Warlord’s blade', { kind: 'item', boss: true }) };
    expect(formatLootAwardLog(line, 'Throne room')).toContain('Boss loot');
    expect(formatLootAwardLog(line, 'Throne room')).toContain('Warlord’s blade');

    const note = appendLootToSessionNotes([], 3, 'Throne room', [line]);
    expect(note.title).toBe('Loot — Throne room');
    expect(note.pinned).toBe(true);
    expect(note.body).toContain('Warlord’s blade');
    expect(note.sessionNumber).toBe(3);

    const again = appendLootToSessionNotes([note], 3, 'Throne room', [
      blankLootLine('200 gp'),
    ]);
    expect(again.id).toBe(note.id);
    expect(again.body).toContain('Warlord’s blade');
    expect(again.body).toContain('200 gp');
  });
});
