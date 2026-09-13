import type { Combatant } from '../../types';
import type { StatBlockFormModel } from '../../systems';

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
  const spent = Math.max(0, Math.min(3, 3 - actionsLeft));

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
        <>
          <button
            type="button"
            className="pip font-mono-stats tabular-nums"
            title="Click: spend 1 action"
            onClick={onSpendAction}
          >
            {/*
              Three slots, filled for what is left and hollow for what is spent,
              rather than a glyph for the count. At a glance it reads as a turn
              partly used; the old version printed the free-action mark at zero,
              which said the opposite of what it meant.
            */}
            <span className="text-accent" aria-hidden>
              {'◆'.repeat(3 - spent)}
            </span>
            <span className="text-muted/60" aria-hidden>
              {'◇'.repeat(spent)}
            </span>{' '}
            {actionsLeft} MAP {combatant.mapPenalty ?? 0}
          </button>
          {/*
            A visible way back. Spending was one click and restoring was a
            shift-click documented only in a tooltip, so an extra tap on the pip
            was unrecoverable in practice. Shown only once there is something to
            undo, so a fresh turn stays uncluttered.
          */}
          {(spent > 0 || (combatant.mapPenalty ?? 0) > 0) && (
            <button
              type="button"
              className="pip"
              onClick={onRestoreActions}
              title="Restore all 3 actions and clear MAP"
              aria-label="Restore actions"
            >
              ↺
            </button>
          )}
        </>
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
