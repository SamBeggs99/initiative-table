import { describe, expect, it } from 'vitest';
import { turnIndexAfterRemove } from './turn';

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
