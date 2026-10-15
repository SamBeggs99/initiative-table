import { describe, expect, it } from 'vitest';
import {
  arrivalsAwaitingInitiative,
  initiativeForSlot,
  initiativeInsertIndex,
  moveInOrder,
  seatArrivals,
} from './turn-order';
import { createCombatant } from '../types';
import type { Combatant } from '../types';

describe('moveInOrder', () => {
  it('moves an item down to the target slot', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up to the target slot', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same array when nothing moves', () => {
    const list = ['a', 'b'];
    expect(moveInOrder(list, 1, 1)).toBe(list);
    expect(moveInOrder(list, 9, 0)).toBe(list);
  });

  it('clamps a target past the end', () => {
    expect(moveInOrder(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });
});

describe('initiativeForSlot', () => {
  it('leaves a number that already reads in order alone', () => {
    expect(initiativeForSlot(18, 12, 14)).toBe(14);
    expect(initiativeForSlot(18, 12, 18)).toBe(18);
    expect(initiativeForSlot(18, 12, 12)).toBe(12);
  });

  it('takes the midpoint when the old number would read out of order', () => {
    expect(initiativeForSlot(18, 12, 25)).toBe(15);
    expect(initiativeForSlot(18, 12, 3)).toBe(15);
  });

  it('falls to a half when no whole number fits the gap', () => {
    expect(initiativeForSlot(18, 17, 25)).toBe(17.5);
  });

  it('matches the count when both neighbours share it', () => {
    expect(initiativeForSlot(15, 15, 3)).toBe(15);
  });

  it('goes above the top and below the bottom', () => {
    expect(initiativeForSlot(null, 20, 5)).toBe(21);
    expect(initiativeForSlot(3, null, 10)).toBe(2);
  });

  it('keeps a number already high enough for the top, or low enough for the bottom', () => {
    expect(initiativeForSlot(null, 20, 25)).toBe(25);
    expect(initiativeForSlot(3, null, 1)).toBe(1);
  });

  it('leaves the pill alone with no neighbours, or in a hand-ordered stretch', () => {
    expect(initiativeForSlot(null, null, 9)).toBe(9);
    // Neighbours that ascend were themselves hand-placed: nothing to derive.
    expect(initiativeForSlot(10, 14, 99)).toBe(99);
  });
});

describe('initiativeInsertIndex', () => {
  const tape = [
    { initiative: 20 },
    { initiative: 15 },
    { initiative: 15 },
    { initiative: 8 },
  ];

  it('slots above the first lower count', () => {
    expect(initiativeInsertIndex(tape, 18)).toBe(1);
    expect(initiativeInsertIndex(tape, 10)).toBe(3);
  });

  it('puts an arrival last among its equals', () => {
    expect(initiativeInsertIndex(tape, 15)).toBe(3);
  });

  it('goes to the top when it beats everyone, and the end when it beats nobody', () => {
    expect(initiativeInsertIndex(tape, 30)).toBe(0);
    expect(initiativeInsertIndex(tape, 1)).toBe(4);
    expect(initiativeInsertIndex(tape, null)).toBe(4);
  });

  it('handles an empty tape', () => {
    expect(initiativeInsertIndex([], 12)).toBe(0);
  });
});

describe('seatArrivals', () => {
  const tape = (): Combatant[] => [
    createCombatant({ name: 'Kaelen', kind: 'pc', initiative: 20 }),
    createCombatant({ name: 'Goblin A', kind: 'npc', initiative: 15 }),
    createCombatant({ name: 'Sable', kind: 'pc', initiative: 8 }),
    createCombatant({ name: 'Ogre', kind: 'npc', initiative: null }),
  ];

  it('finds the rows still waiting on a number', () => {
    expect(arrivalsAwaitingInitiative(tape()).map((c) => c.name)).toEqual([
      'Ogre',
    ]);
    expect(arrivalsAwaitingInitiative([])).toEqual([]);
  });

  it('drops an arrival into place without touching anyone else', () => {
    const list = tape();
    const ogre = list[3]!;
    const { combatants } = seatArrivals(list, 0, { [ogre.id]: 17 });

    expect(combatants.map((c) => c.name)).toEqual([
      'Kaelen',
      'Ogre',
      'Goblin A',
      'Sable',
    ]);
    // The counts already rolled are left exactly as they were.
    expect(combatants.map((c) => c.initiative)).toEqual([20, 17, 15, 8]);
  });

  it('keeps the turn on the current actor when an arrival lands above them', () => {
    const list = tape();
    const ogre = list[3]!;
    // Sable is acting, at index 2.
    const { combatants, turnIndex } = seatArrivals(list, 2, { [ogre.id]: 25 });
    expect(combatants[turnIndex]!.name).toBe('Sable');
    expect(turnIndex).toBe(3);
  });

  it('seats several arrivals at once, ties last among equals', () => {
    const list = tape();
    const ogre = list[3]!;
    const wolf = createCombatant({ name: 'Wolf', kind: 'npc', initiative: null });
    const { combatants } = seatArrivals([...list, wolf], 0, {
      [ogre.id]: 15,
      [wolf.id]: 15,
    });
    expect(combatants.map((c) => c.name)).toEqual([
      'Kaelen',
      'Goblin A',
      'Ogre',
      'Wolf',
      'Sable',
    ]);
  });

  it('is a no-op when nothing is joining', () => {
    const list = tape();
    const result = seatArrivals(list, 1, {});
    expect(result.combatants).toBe(list);
    expect(result.turnIndex).toBe(1);
  });
});
