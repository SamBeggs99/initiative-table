import { describe, expect, it } from 'vitest';
import { isSkippableTurn, nextActiveIndex, turnIndexAfterRemove } from './turn';
import type { Combatant } from '../types';

describe('turnIndexAfterRemove', () => {
  it('decrements when a combatant before the active one is removed', () => {
    // [A,B,C] active B (1) → remove A → [B,C] active B (0)
    expect(turnIndexAfterRemove(3, 1, 0)).toBe(0);
  });

  it('leaves the index alone when removing someone after the active one', () => {
    // [A,B,C] active A (0) → remove C → [A,B] still A (0)
    expect(turnIndexAfterRemove(3, 0, 2)).toBe(0);
  });

  it('slides the next combatant into place when the active one is removed', () => {
    // [A,B,C] active B (1) → remove B → [A,C] active C (1)
    expect(turnIndexAfterRemove(3, 1, 1)).toBe(1);
  });

  it('wraps to the top when the last (active) combatant is removed', () => {
    // [A,B,C] active C (2) → remove C → [A,B] active A (0)
    expect(turnIndexAfterRemove(3, 2, 2)).toBe(0);
  });

  it('returns 0 for an empty or single-combatant list', () => {
    expect(turnIndexAfterRemove(1, 0, 0)).toBe(0);
    expect(turnIndexAfterRemove(0, 0, -1)).toBe(0);
  });
});

/**
 * Dead enemies stay on the tape but the clock walks past them. Pressing Next,
 * reading a name that cannot act, and pressing Next again is friction the DM
 * pays for every corpse, every round.
 */
describe('skipping downed combatants', () => {
  const mk = (
    name: string,
    kind: Combatant['kind'],
    hp: number,
  ): Combatant => ({ ...({} as Combatant), id: name, name, kind, hp, maxHp: 10 });

  describe('isSkippableTurn', () => {
    it('skips a slain enemy', () => {
      expect(isSkippableTurn(mk('Goblin', 'npc', 0))).toBe(true);
    });

    it('never skips a downed PC — their turn is when death saves happen', () => {
      expect(isSkippableTurn(mk('Vera', 'pc', 0))).toBe(false);
    });

    it('never skips a lair action, which has no HP to lose', () => {
      expect(isSkippableTurn(mk('Lair', 'lair', 0))).toBe(false);
    });

    it('does not skip a living enemy', () => {
      expect(isSkippableTurn(mk('Ogre', 'npc', 1))).toBe(false);
    });

    it('skips an enemy driven below zero', () => {
      expect(isSkippableTurn(mk('Ogre', 'npc', -7))).toBe(true);
    });
  });

  describe('nextActiveIndex', () => {
    it('walks past one corpse', () => {
      const list = [
        mk('A', 'npc', 5),
        mk('B', 'npc', 0),
        mk('C', 'npc', 5),
      ];
      const r = nextActiveIndex(list, 0);
      expect(r.index).toBe(2);
      expect(r.wrapped).toBe(false);
      expect(r.skipped.map((c) => c.name)).toEqual(['B']);
    });

    it('walks past a run of corpses', () => {
      const list = [
        mk('A', 'npc', 5),
        mk('B', 'npc', 0),
        mk('C', 'npc', 0),
        mk('D', 'npc', 0),
        mk('E', 'pc', 9),
      ];
      const r = nextActiveIndex(list, 0);
      expect(r.index).toBe(4);
      expect(r.skipped.map((c) => c.name)).toEqual(['B', 'C', 'D']);
    });

    it('reports the wrap when the corpses are at the end', () => {
      const list = [mk('A', 'pc', 9), mk('B', 'npc', 0)];
      const r = nextActiveIndex(list, 0);
      expect(r.index).toBe(0);
      expect(r.wrapped).toBe(true);
      expect(r.skipped.map((c) => c.name)).toEqual(['B']);
    });

    it('still stops on a downed PC', () => {
      const list = [mk('A', 'npc', 5), mk('Vera', 'pc', 0)];
      const r = nextActiveIndex(list, 0);
      expect(r.index).toBe(1);
      expect(r.skipped).toEqual([]);
    });

    // The loop guard: without it, a wipe would spin forever.
    it('advances by one when every combatant is down', () => {
      const list = [mk('A', 'npc', 0), mk('B', 'npc', 0), mk('C', 'npc', 0)];
      expect(nextActiveIndex(list, 0).index).toBe(1);
      expect(nextActiveIndex(list, 2).index).toBe(0);
      expect(nextActiveIndex(list, 2).wrapped).toBe(true);
    });

    it('handles a single living combatant by staying put', () => {
      const list = [mk('A', 'pc', 9)];
      const r = nextActiveIndex(list, 0);
      expect(r.index).toBe(0);
      expect(r.wrapped).toBe(true);
    });

    it('handles an empty tape', () => {
      expect(nextActiveIndex([], 0)).toEqual({
        index: 0,
        wrapped: false,
        skipped: [],
      });
    });
  });
});
