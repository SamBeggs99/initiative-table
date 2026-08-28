import { describe, expect, it } from 'vitest';
import { fuzzyScore } from './palette/fuzzy';
import { parsePaletteInput, type PaletteContext } from './palette/parse';
import { createCombatant } from '../types';

const emptyCtx = (): PaletteContext => ({
  combatants: [],
  party: [],
  npcs: [],
  trackers: [],
  creatures: [],
  spells: [],
});

describe('fuzzyScore', () => {
  it('ranks exact and prefix matches highest', () => {
    expect(fuzzyScore('goblin', 'Goblin')).toBeGreaterThan(fuzzyScore('goblin', 'Hobgoblin'));
    expect(fuzzyScore('kael', 'Kael')).toBeGreaterThan(0);
  });
});

describe('parsePaletteInput', () => {
  it('parses next/back', () => {
    expect(parsePaletteInput('next', emptyCtx()).type).toBe('next');
    expect(parsePaletteInput('back', emptyCtx()).type).toBe('back');
  });

  it('treats blank, help, and ? as the legend', () => {
    expect(parsePaletteInput('', emptyCtx()).type).toBe('empty');
    expect(parsePaletteInput('help', emptyCtx()).type).toBe('help');
    expect(parsePaletteInput('?', emptyCtx()).type).toBe('help');
    expect(parsePaletteInput('hp', emptyCtx()).type).toBe('help');
  });

  it('parses start, party to combat, and new pc', () => {
    expect(parsePaletteInput('start', emptyCtx())).toMatchObject({
      type: 'start',
      runnable: true,
    });
    expect(parsePaletteInput('party to combat', emptyCtx())).toMatchObject({
      type: 'party-to-combat',
      runnable: true,
    });
    expect(parsePaletteInput('new pc Aria', emptyCtx())).toMatchObject({
      type: 'new-pc',
      name: 'Aria',
      runnable: true,
    });
    expect(parsePaletteInput('clear', emptyCtx())).toMatchObject({
      type: 'clear',
      runnable: true,
    });
    expect(parsePaletteInput('clear encounter', emptyCtx()).type).toBe('clear');
  });

  it('parses damage and heal against combatants', () => {
    const ctx = emptyCtx();
    ctx.combatants = [
      createCombatant({ name: 'Kael', kind: 'pc', hp: 40, maxHp: 40 }),
      createCombatant({ name: 'Grix', kind: 'npc', hp: 22, maxHp: 22 }),
    ];
    const dmg = parsePaletteInput('dmg kael 14', ctx);
    expect(dmg).toMatchObject({
      type: 'damage',
      amount: 14,
      targetName: 'Kael',
      runnable: true,
    });
    const heal = parsePaletteInput('heal grix 8', ctx);
    expect(heal).toMatchObject({
      type: 'heal',
      amount: 8,
      targetName: 'Grix',
      runnable: true,
    });
  });

  it('parses quantity add and clock', () => {
    const add = parsePaletteInput('4 goblins', {
      ...emptyCtx(),
      creatures: [{ id: '1', name: 'Goblin' }],
    });
    expect(add).toMatchObject({
      type: 'add-creatures',
      quantity: 4,
      query: 'goblins',
      runnable: true,
    });
    expect(add.preview.toLowerCase()).toContain('goblin');

    const clock = parsePaletteInput('clock ritual 6', emptyCtx());
    expect(clock).toMatchObject({
      type: 'clock',
      name: 'ritual',
      segments: 6,
      runnable: true,
    });
  });

  it('parses spell lookup', () => {
    const intent = parsePaletteInput('spell fireball', {
      ...emptyCtx(),
      spells: [{ id: 's1', name: 'Fireball' }],
    });
    expect(intent).toMatchObject({
      type: 'open-spell',
      spellName: 'Fireball',
      runnable: true,
    });
  });

  it('parses condition with rounds', () => {
    const ctx = emptyCtx();
    ctx.combatants = [createCombatant({ name: 'Kael', kind: 'pc' })];
    const cond = parsePaletteInput('cond kael frightened 3', ctx);
    expect(cond).toMatchObject({
      type: 'condition',
      condition: 'Frightened',
      rounds: 3,
      targetName: 'Kael',
      runnable: true,
    });
  });

  it('opens NPC on bare name when present', () => {
    const ctx = emptyCtx();
    ctx.npcs = [
      {
        id: 'npc-1',
        name: 'Grix',
        kind: 'statted',
        tags: [],
        notes: '',
      },
    ];
    const open = parsePaletteInput('grix', ctx);
    expect(open).toMatchObject({
      type: 'open',
      source: 'npc',
      targetName: 'Grix',
      runnable: true,
    });
  });

  it('adds adult red dragon as one creature', () => {
    const intent = parsePaletteInput('adult red dragon', {
      ...emptyCtx(),
      creatures: [{ id: 'x', name: 'Adult Red Dragon' }],
    });
    expect(intent.type).toBe('add-creatures');
    if (intent.type === 'add-creatures') {
      expect(intent.quantity).toBe(1);
    }
  });
});
