import { describe, expect, it } from 'vitest';
import { createCombatant, type Combatant } from '../types';
import { getSystemAdapter } from '../systems';
import {
  applyInitiativeMap,
  buildInitiativePromptRows,
  expandInitiativeValues,
  rollInitiativeFor,
  seedInitiativeValues,
  stripPackSuffix,
} from './initiative-prompt';

describe('stripPackSuffix', () => {
  it('drops A–Z and numeric pack suffixes', () => {
    expect(stripPackSuffix('Goblin A')).toBe('Goblin');
    expect(stripPackSuffix('Wolf L')).toBe('Wolf');
    expect(stripPackSuffix('Ancient Red Dragon A')).toBe('Ancient Red Dragon');
    expect(stripPackSuffix('Kael')).toBe('Kael');
  });
});

describe('buildInitiativePromptRows', () => {
  it('gives every combatant their own field, including pack members', () => {
    const gk = 'pack-1';
    const pc = createCombatant({
      name: 'Kael',
      kind: 'pc',
      dex: 16,
      initiative: null,
    });
    const a = createCombatant({
      name: 'Goblin A',
      kind: 'npc',
      groupKey: gk,
      dex: 14,
      initiative: 15,
    });
    const b = createCombatant({
      name: 'Goblin B',
      kind: 'npc',
      groupKey: gk,
      dex: 14,
      initiative: 15,
    });
    const rows = buildInitiativePromptRows([pc, a, b], { rolled: true });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.label).toBe('Kael');
    expect(rows[0]!.combatantIds).toEqual([pc.id]);
    expect(rows[0]!.suggested).toBeNull();
    expect(rows[0]!.hint).toBe('d20+3');
    expect(rows[1]!.label).toBe('Goblin A');
    expect(rows[1]!.combatantIds).toEqual([a.id]);
    expect(rows[1]!.suggested).toBeNull();
    expect(rows[2]!.label).toBe('Goblin B');
    expect(rows[2]!.combatantIds).toEqual([b.id]);
    expect(rows[2]!.suggested).toBeNull();
  });

  it('does not prefill leftover scores from adding creatures', () => {
    const npc = createCombatant({
      name: 'Ireena',
      kind: 'npc',
      initiative: 11,
    });
    const rows = buildInitiativePromptRows([npc], { rolled: true });
    expect(rows[0]!.suggested).toBeNull();
  });

  it('prefills PF2e perception and lair 20', () => {
    const amiri = createCombatant({
      name: 'Amiri',
      kind: 'pc',
      perception: 7,
    });
    const lair = createCombatant({ name: 'Lair', kind: 'lair' });
    const rows = buildInitiativePromptRows([amiri, lair], { rolled: false });
    expect(rows[0]!.suggested).toBe(7);
    expect(rows[0]!.hint).toBe('Perception +7');
    expect(rows[1]!.suggested).toBe(20);
    expect(rows[1]!.hint).toBe('usually 20');
  });

  it('reads perception off an embedded PF2e stat block', () => {
    const goblin = createCombatant({
      name: 'Goblin',
      kind: 'npc',
      statBlock: {
        pf2e: { perception: 5 },
      } as Combatant['statBlock'],
    });
    const rows = buildInitiativePromptRows([goblin], { rolled: false });
    expect(rows[0]!.suggested).toBe(5);
  });
});

describe('expandInitiativeValues', () => {
  it('writes one score per combatant', () => {
    const gk = 'pack-3';
    const a = createCombatant({ name: 'Goblin A', kind: 'npc', groupKey: gk });
    const b = createCombatant({ name: 'Goblin B', kind: 'npc', groupKey: gk });
    const rows = buildInitiativePromptRows([a, b], { rolled: true });
    const map = expandInitiativeValues(rows, {
      [a.id]: '14',
      [b.id]: '9',
    });
    expect(map).toEqual({ [a.id]: 14, [b.id]: 9 });
  });

  it('returns null when a row is blank', () => {
    const pc = createCombatant({ name: 'Kael', kind: 'pc' });
    const rows = buildInitiativePromptRows([pc], { rolled: true });
    expect(expandInitiativeValues(rows, { [pc.id]: '' })).toBeNull();
  });
});

describe('applyInitiativeMap', () => {
  it('sets listed combatants and leaves others', () => {
    const a = createCombatant({ name: 'A', kind: 'pc', initiative: null });
    const b = createCombatant({ name: 'B', kind: 'npc', initiative: 3 });
    const next = applyInitiativeMap([a, b], { [a.id]: 18 });
    expect(next[0]!.initiative).toBe(18);
    expect(next[1]!.initiative).toBe(3);
  });
});

describe('rollInitiativeFor', () => {
  it('uses 20 for lairs and perception for PF2e', () => {
    const lair = createCombatant({ name: 'Lair', kind: 'lair' });
    expect(rollInitiativeFor(lair, getSystemAdapter('dnd5e'))).toBe(20);
    const amiri = createCombatant({
      name: 'Amiri',
      kind: 'pc',
      perception: 9,
    });
    expect(rollInitiativeFor(amiri, getSystemAdapter('pf2e'))).toBe(9);
  });
});

describe('seedInitiativeValues', () => {
  it('stringifies suggestions and leaves blanks empty', () => {
    const pc = createCombatant({ name: 'Kael', kind: 'pc', initiative: null });
    const lair = createCombatant({ name: 'Lair', kind: 'lair' });
    const rows = buildInitiativePromptRows([pc, lair], { rolled: true });
    expect(seedInitiativeValues(rows)).toEqual({
      [pc.id]: '',
      [lair.id]: '20',
    });
  });
});
