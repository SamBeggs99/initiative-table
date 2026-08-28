import { formatModifier } from '../../lib/statblock-derived';

export function AbilityBonusNudge({
  bonus,
  onAdjust,
}: {
  bonus: number;
  onAdjust?: (delta: number) => void;
}) {
  if (!onAdjust && bonus === 0) return null;
  const label = bonus === 0 ? '+1' : formatModifier(bonus);
  return (
    <div className="mt-0.5 flex items-center justify-center gap-0.5">
      {onAdjust && bonus !== 0 && (
        <button
          type="button"
          className="stat-nudge"
          aria-label="Remove 1 from this modifier"
          title="−1 to the modifier (printed score stays)"
          onClick={() => onAdjust(-1)}
        >
          −
        </button>
      )}
      {onAdjust ? (
        <button
          type="button"
          className={`stat-nudge ${bonus !== 0 ? 'stat-nudge-on' : ''}`}
          aria-label={
            bonus === 0
              ? 'Add +1 to this modifier'
              : `Modifier bonus ${label}. Click for another +1`
          }
          title="Manual +1 to the modifier — does not change the printed score"
          onClick={() => onAdjust(1)}
        >
          {label}
        </button>
      ) : (
        <span className="stat-nudge stat-nudge-on">{label}</span>
      )}
    </div>
  );
}
