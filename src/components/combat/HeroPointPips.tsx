import {
  clampHeroPoints,
  HERO_POINT_MAX,
  HERO_POINT_SESSION_START,
} from '../../lib/party';

/**
 * Hero-point pips for a player (cap 5). Click a filled last pip to spend;
 * click an empty pip to award up to that count.
 */
export function HeroPointPips({
  value,
  onChange,
  readOnly = false,
  compact = false,
}: {
  value: number | undefined;
  onChange?: (next: number) => void;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const n = clampHeroPoints(value ?? HERO_POINT_SESSION_START);
  return (
    <div
      className={`inline-flex items-center gap-0.5 ${compact ? '' : 'py-0.5'}`}
      role="group"
      aria-label={`Hero points ${n} of ${HERO_POINT_MAX}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] uppercase tracking-wider text-condition">
        Hero
      </span>
      {Array.from({ length: HERO_POINT_MAX }, (_, i) => {
        const count = i + 1;
        const filled = count <= n;
        const label =
          count === n
            ? 'Spend a hero point'
            : count > n
              ? `Award — set to ${count}`
              : `Set to ${count}`;
        return (
          <button
            key={count}
            type="button"
            disabled={readOnly || !onChange}
            className={`font-mono-stats text-sm leading-none ${
              filled ? 'text-condition' : 'text-muted/50'
            } ${readOnly || !onChange ? '' : 'hover:text-text'}`}
            title={readOnly ? `${n} hero points` : label}
            aria-label={readOnly ? `${n} of ${HERO_POINT_MAX}` : label}
            onClick={() => {
              if (readOnly || !onChange) return;
              onChange(count === n ? n - 1 : count);
            }}
          >
            {filled ? '●' : '○'}
          </button>
        );
      })}
    </div>
  );
}
