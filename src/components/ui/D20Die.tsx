/**
 * Physical-looking d20: a faceted stone die that tumbles, then lands with
 * the result glowing on the top face. CSS motion, not table physics.
 */
export function D20Die({
  value,
  rolling,
  glowing,
  spin = 1,
  onTumbleEnd,
}: {
  value?: number;
  rolling: boolean;
  glowing: boolean;
  spin?: number;
  onTumbleEnd?: () => void;
}) {
  const label =
    value == null || !Number.isFinite(value) ? '' : String(Math.round(value));
  const small = label.length > 2;

  return (
    <span
      className={`die-stage ${rolling ? 'is-rolling' : ''} ${glowing ? 'is-glowing' : ''}`}
      data-spin={((spin - 1) % 6) + 1}
      aria-hidden="true"
    >
      <span className="die-shadow" />
      <span
        className="die-body"
        onAnimationEnd={(e) => {
          if (e.animationName.includes('die-tumble')) onTumbleEnd?.();
        }}
      >
        <svg
          className="die-svg"
          viewBox="0 0 64 64"
          width="40"
          height="40"
        >
          <polygon
            className="die-stone"
            points="32,3 57,17 57,47 32,61 7,47 7,17"
          />
          <polygon className="die-facet die-facet-l" points="32,3 7,17 18,40 32,32" />
          <polygon className="die-facet die-facet-r" points="32,3 57,17 46,40 32,32" />
          <polygon className="die-facet die-facet-bl" points="7,17 7,47 18,40" />
          <polygon className="die-facet die-facet-br" points="57,17 57,47 46,40" />
          <polygon className="die-facet die-facet-b" points="18,40 46,40 32,61 7,47 57,47" />
          <polygon className="die-face" points="32,14 46,40 18,40" />
          <text
            className="die-num"
            x="32"
            y={small ? 35 : 36}
            textAnchor="middle"
            fontSize={small ? 11 : 15}
          >
            {rolling ? '' : label}
          </text>
        </svg>
      </span>
    </span>
  );
}
