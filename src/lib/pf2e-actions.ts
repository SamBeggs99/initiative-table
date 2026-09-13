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

/** How a bare action cost is written in a spell's cast-time line. */
export function castTimeLabel(cost: ActionCost): string {
  if (cost === 'reaction') return 'reaction';
  if (cost === 'free') return 'free action';
  if (cost === 1) return '1 action';
  return `${cost} actions`;
}

/**
 * Every spelling of a bare action cost the app writes or imports.
 *
 * A PF2e cast time is usually just the action cost restated in words, but it is
 * also where a ritual's "1 minute" or a spell's "1 hour" lives. Recognising the
 * restatements lets the editor keep the two in step when the cost changes
 * without trampling a cast time the DM actually wrote.
 */
const PLAIN_CAST_TIMES = new Set([
  '1 action',
  'one action',
  '2 actions',
  'two actions',
  '3 actions',
  'three actions',
  'reaction',
  '1 reaction',
  'free',
  'free action',
  '1 free action',
]);

export function isPlainActionCastTime(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === '' || PLAIN_CAST_TIMES.has(t);
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
