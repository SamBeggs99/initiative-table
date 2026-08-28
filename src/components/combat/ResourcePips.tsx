import type { Combatant } from '../../types';
import type { StatBlockFormModel } from '../../systems';
import { actionCostGlyph } from '../../lib/pf2e-actions';

export function ResourcePips({
  combatant,
  form,
  onToggleReaction,
  onToggleConcentration,
  onSpendLegendary,
  onSpendLimited,
  onSpendAction,
  onRestoreActions,
}: {
  combatant: Combatant;
  form: StatBlockFormModel;
  onToggleReaction: () => void;
  onToggleConcentration: () => void;
  onSpendLegendary: () => void;
  onSpendLimited: (name: string) => void;
  /** Spend one action from the PF2e turn pool. */
  onSpendAction?: () => void;
  /** Reset to 3 actions (and clear MAP). */
  onRestoreActions?: () => void;
}) {
  const hasLegendary = form.showLegendaryBlock && combatant.legendaryActions.max > 0;
  const hasLimited = combatant.limitedUses.some((u) => u.max > 0);
  const actionsLeft = combatant.actionsRemaining ?? 3;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <button
        type="button"
        className={`pip ${combatant.reactionUsed ? 'pip-spent' : 'row-affordance'}`}
        onClick={onToggleReaction}
        title={combatant.reactionUsed ? 'Reaction used — click to restore' : 'Spend reaction'}
      >
        Rxn
      </button>

      <button
        type="button"
        className={`pip ${combatant.concentrating ? 'pip-on' : 'row-affordance'}`}
        onClick={onToggleConcentration}
        title="Concentration"
      >
        Conc
      </button>

      {hasLegendary && (
        <button
          type="button"
          className="pip font-mono-stats tabular-nums"
          onClick={onSpendLegendary}
          title="Spend legendary action"
        >
          LA {combatant.legendaryActions.used}/{combatant.legendaryActions.max}
        </button>
      )}

      {form.showLegendaryResistance && combatant.legendaryResistance.max > 0 && (
        <span className="pip font-mono-stats tabular-nums">
          LR {combatant.legendaryResistance.used}/{combatant.legendaryResistance.max}
        </span>
      )}

      {form.showPf2eBlock && (
        <button
          type="button"
          className="pip font-mono-stats tabular-nums"
          title="Click: spend 1 action · Shift+click: restore 3 / clear MAP"
          onClick={(e) => {
            if (e.shiftKey) onRestoreActions?.();
            else onSpendAction?.();
          }}
        >
          <span className="text-accent" aria-hidden>
            {actionCostGlyph(
              actionsLeft >= 3 ? 3 : actionsLeft === 2 ? 2 : actionsLeft === 1 ? 1 : 'free',
            )}
          </span>{' '}
          {actionsLeft} MAP {combatant.mapPenalty ?? 0}
        </button>
      )}

      {hasLimited &&
        combatant.limitedUses
          .filter((u) => u.max > 0)
          .map((u) => (
            <button
              key={u.name}
              type="button"
              className="pip font-mono-stats tabular-nums"
              onClick={() => onSpendLimited(u.name)}
              title={u.recharge ? `Recharge ${u.recharge}` : u.name}
            >
              {u.name} {u.used}/{u.max}
            </button>
          ))}
    </div>
  );
}
