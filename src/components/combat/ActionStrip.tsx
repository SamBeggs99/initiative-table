import { formatEntryDamage } from '../../lib/damage-types';
import { formatEntryOffense } from '../../lib/parse';
import {
  actionCostGlyph,
  actionCostLabel,
  resolveActionCost,
  type ActionCost,
} from '../../lib/pf2e-actions';
import type { Entry } from '../../types';

/**
 * Compact buttons for combatant activities — optional PF2e cost glyphs,
 * damage line, and click-to-use.
 */
export function ActionStrip({
  actions,
  actionCosts,
  actionsRemaining,
  showCosts,
  disabled,
  onUse,
}: {
  actions: Entry[];
  actionCosts?: Record<string, ActionCost>;
  actionsRemaining?: number;
  showCosts?: boolean;
  disabled?: boolean;
  onUse: (entry: Entry, cost: ActionCost) => void;
}) {
  if (actions.length === 0) return null;
  const remaining = actionsRemaining ?? 3;

  return (
    <div
      className="mt-1 flex flex-wrap gap-1"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Activities"
    >
      {actions.map((a) => {
        const cost = showCosts ? resolveActionCost(actionCosts, a.name) : 1;
        const spend =
          !showCosts || cost === 'reaction' || cost === 'free'
            ? 0
            : (cost as 1 | 2 | 3);
        const tooExpensive = showCosts && spend > 0 && remaining < spend;
        const dmg = formatEntryDamage(a.damage);
        const offense = formatEntryOffense(a);
        const req = a.requirements?.trim();
        const time = a.duration?.trim();
        return (
          <button
            key={a.name}
            type="button"
            className={`pip max-w-[16rem] truncate font-mono-stats ${
              tooExpensive ? 'pip-spent opacity-60' : ''
            }`}
            disabled={disabled || tooExpensive}
            title={`${a.name}${offense ? ` — ${offense}` : ''}${dmg ? ` — ${dmg}` : ''}${
              time ? `\nTime: ${time}` : ''
            }${req ? `\nRequirements: ${req}` : ''} — ${
              showCosts ? actionCostLabel(cost) : 'Use'
            }${a.desc ? `\n${a.desc}` : ''}`}
            onClick={() => onUse(a, cost)}
          >
            {showCosts && (
              <>
                <span className="text-accent" aria-hidden>
                  {actionCostGlyph(cost)}
                </span>{' '}
              </>
            )}
            <span className="font-sans text-[10px] font-semibold">{a.name}</span>
            {offense && (
              <span className="ml-1 text-[9px] tabular-nums text-text">{offense}</span>
            )}
            {time && (
              <span className="ml-1 text-[9px] text-amber" aria-label={`Time: ${time}`}>
                {time}
              </span>
            )}
            {req && (
              <span className="ml-1 text-[9px] text-amber" aria-label="Has requirements">
                req
              </span>
            )}
            {dmg && (
              <span className="ml-1 text-[9px] text-damage">{dmg}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated Use ActionStrip — kept as an alias for older imports. */
export { ActionStrip as Pf2eActionStrip };
