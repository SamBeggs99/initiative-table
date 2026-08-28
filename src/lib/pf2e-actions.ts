/** PF2e action-cost helpers — glyphs and spending for the three-action economy. */

export type ActionCost = 1 | 2 | 3 | 'reaction' | 'free';

/** Classic diamond / free / reaction markers used next to ability names. */
export function actionCostGlyph(cost: ActionCost | undefined): string {
  if (cost === 'free') return '◇';
  if (cost === 'reaction') return '↺';
  const n = cost === 2 || cost === 3 ? cost : 1;
  return '◆'.repeat(n);
}

export function actionCostLabel(cost: ActionCost | undefined): string {
  if (cost === 'free') return 'Free action';
  if (cost === 'reaction') return 'Reaction';
  if (cost === 2) return '2 actions';
  if (cost === 3) return '3 actions';
  return '1 action';
}

export function resolveActionCost(
  costs: Record<string, ActionCost> | undefined,
  actionName: string,
): ActionCost {
  return costs?.[actionName] ?? 1;
}

/** Numeric cost for the remaining-actions counter (reactions/free don't spend the pool). */
export function actionsSpentByCost(cost: ActionCost): number {
  if (cost === 'reaction' || cost === 'free') return 0;
  return cost;
}

export function spendActionsRemaining(
  remaining: number | undefined,
  cost: ActionCost,
): number {
  const cur = remaining ?? 3;
  const spend = actionsSpentByCost(cost);
  return Math.max(0, cur - spend);
}
