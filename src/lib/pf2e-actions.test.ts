import { describe, expect, it } from 'vitest';
import {
  actionCostGlyph,
  actionsSpentByCost,
  spendActionsRemaining,
} from './pf2e-actions';

describe('pf2e action costs', () => {
  it('renders diamond glyphs for 1–3 action activities', () => {
    expect(actionCostGlyph(1)).toBe('◆');
    expect(actionCostGlyph(2)).toBe('◆◆');
    expect(actionCostGlyph(3)).toBe('◆◆◆');
    expect(actionCostGlyph('free')).toBe('◇');
    expect(actionCostGlyph('reaction')).toBe('↺');
  });

  it('only spends the action pool for 1–3 costs', () => {
    expect(actionsSpentByCost(2)).toBe(2);
    expect(actionsSpentByCost('reaction')).toBe(0);
    expect(spendActionsRemaining(3, 2)).toBe(1);
    expect(spendActionsRemaining(1, 3)).toBe(0);
    expect(spendActionsRemaining(2, 'free')).toBe(2);
  });
});
