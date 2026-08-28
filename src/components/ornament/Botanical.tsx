/**
 * Decorative botanical marks. Every export is inert: aria-hidden, no pointer
 * events, and tinted from theme tokens so the motif follows the palette.
 * Ornament never encodes state — nothing here may be the only cue for data.
 */

const LEAF = 'var(--color-leaf)';
const LEAF_DEEP = 'var(--color-leaf-deep)';
const STEM = 'var(--color-stem)';
const BLOOM = 'var(--color-bloom)';
const BLOOM_DEEP = 'var(--color-bloom-deep)';
const BLOOM_CORE = 'var(--color-amber)';

/**
 * Layered five-petal bloom: an outer ring, a smaller inner ring offset by half
 * a petal, then the core. The offset is what stops it reading as a plain dot.
 */
function Bloom({
  cx,
  cy,
  r,
  petal = BLOOM,
  inner = BLOOM_DEEP,
  core = BLOOM_CORE,
}: {
  cx: number;
  cy: number;
  r: number;
  petal?: string;
  inner?: string;
  core?: string;
}) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={`o${deg}`}
          cx={cx}
          cy={cy - r * 0.62}
          rx={r * 0.44}
          ry={r * 0.7}
          fill={petal}
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
      {[36, 108, 180, 252, 324].map((deg) => (
        <ellipse
          key={`i${deg}`}
          cx={cx}
          cy={cy - r * 0.38}
          rx={r * 0.26}
          ry={r * 0.42}
          fill={inner}
          opacity={0.85}
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.3} fill={core} />
    </g>
  );
}

/** Closed bud — reads as "about to flower" and fills gaps between blooms. */
function Bud({
  x,
  y,
  rotate = 0,
  scale = 1,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0 C-3 -3 -3 -8 0 -11 C3 -8 3 -3 0 0 Z" fill={BLOOM} />
      <path d="M0 0 C-4 -1 -5 -4 -4 -6 C-1 -5 0 -2 0 0 Z" fill={LEAF_DEEP} />
      <path d="M0 0 C4 -1 5 -4 4 -6 C1 -5 0 -2 0 0 Z" fill={LEAF_DEEP} />
    </g>
  );
}

/** Veined leaf. Veins are what make it read as foliage rather than a blob. */
function Leaf({
  x,
  y,
  rotate = 0,
  scale = 1,
  fill = LEAF,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  fill?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path
        d="M0 0 C4 -5 10 -6 15 -1 C11 4 4 5 0 0 Z"
        fill={fill}
      />
      <g stroke={STEM} strokeWidth={0.5} fill="none" opacity={0.5}>
        <path d="M0 0 C5 -1 10 -1 14 -1" />
        <path d="M4 -0.6 L6 -3.2" />
        <path d="M8 -1 L10 -3.6" />
        <path d="M5 -0.2 L6.5 2" />
        <path d="M9 -0.6 L10.5 1.6" />
      </g>
    </g>
  );
}

/** Curling tendril — the illuminated-margin flourish. */
function Tendril({
  x,
  y,
  rotate = 0,
  scale = 1,
  width = 0.9,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  width?: number;
}) {
  return (
    <path
      d="M0 0 C6 -2 11 -5 12 -10 C12.6 -13.6 10 -16 7.4 -15 C4.6 -14 4.6 -10 7.6 -9.2 C9.6 -8.7 11.4 -9.8 12 -11.4"
      fill="none"
      stroke={STEM}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={0.85}
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}
    />
  );
}

/** Sprout brand mark — pairs with the app title. */
export function SproutMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className="pointer-events-none shrink-0"
    >
      <path
        d="M12 23 C12 17 12 12 12 7"
        stroke={STEM}
        strokeWidth={1.7}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 17 C8 17.5 4.5 15.5 3 12 C7.5 10.8 11 13 12 17 Z"
        fill={LEAF_DEEP}
      />
      <path
        d="M12 13.5 C16 14 19.5 12 21 8.5 C16.5 7.3 13 9.5 12 13.5 Z"
        fill={LEAF}
      />
      <Tendril x={12} y={9} rotate={-28} scale={0.4} width={1.1} />
      <Bloom cx={12} cy={5} r={4.4} />
    </svg>
  );
}

/**
 * Horizontal divider: trailing vines flanking a centred bloom. Built from
 * flex + a fixed-size glyph so it never distorts at any container width.
 */
export function VineRule({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none flex select-none items-center gap-1.5 ${className}`}
      aria-hidden
    >
      <span className="vine-hair vine-hair-left h-px flex-1" />
      <svg width="86" height="18" viewBox="0 0 86 18" focusable="false">
        <path
          d="M1 9 C10 9 14 4 22 4 M85 9 C76 9 72 14 64 14"
          stroke={STEM}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
          opacity={0.75}
        />
        <Leaf x={19} y={4} rotate={-30} scale={0.6} />
        <Leaf x={24} y={5} rotate={26} scale={0.5} fill={LEAF_DEEP} />
        <Leaf x={67} y={14} rotate={150} scale={0.6} />
        <Leaf x={62} y={13} rotate={206} scale={0.5} fill={LEAF_DEEP} />
        <Bud x={34} y={7} rotate={-24} scale={0.5} />
        <Bud x={52} y={11} rotate={156} scale={0.5} />
        <Bloom cx={43} cy={9} r={5} />
      </svg>
      <span className="vine-hair vine-hair-right h-px flex-1" />
    </div>
  );
}

/** Trailing vine for panel corners. */
export function CornerVine({
  corner = 'top-right',
  size = 88,
  className = 'ornament',
}: {
  corner?: 'top-right' | 'bottom-left';
  size?: number;
  className?: string;
}) {
  const flip = corner === 'bottom-left';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      aria-hidden
      focusable="false"
      className={`${className} pointer-events-none absolute ${
        flip ? 'bottom-0 left-0 -scale-x-100 -scale-y-100' : 'right-0 top-0'
      }`}
    >
      <path
        d="M88 2 C68 5 53 16 43 32 C34 46 25 56 8 62"
        stroke={STEM}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M62 9 C60 21 54 31 43 37"
        stroke={STEM}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
        opacity={0.7}
      />
      <Leaf x={64} y={12} rotate={-42} scale={0.95} />
      <Leaf x={57} y={19} rotate={128} scale={0.7} fill={LEAF_DEEP} />
      <Leaf x={46} y={29} rotate={18} scale={0.85} />
      <Leaf x={38} y={40} rotate={-16} scale={0.75} fill={LEAF_DEEP} />
      <Leaf x={26} y={52} rotate={12} scale={0.7} />
      <Tendril x={44} y={35} rotate={124} scale={0.75} />
      <Bud x={33} y={47} rotate={-38} scale={0.7} />
      <Bloom cx={77} cy={8} r={6} />
      <Bloom cx={53} cy={26} r={4} />
      <Bloom cx={15} cy={58} r={4.6} />
    </svg>
  );
}

/**
 * Small inline sprig for list headers and empty rows — the smallest botanical
 * mark that still reads as a plant rather than a bullet.
 */
export function Sprig({
  size = 34,
  className = 'ornament-soft',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox="0 0 40 22"
      aria-hidden
      focusable="false"
      className={`${className} pointer-events-none shrink-0`}
    >
      <path
        d="M2 20 C10 18 16 13 20 6"
        stroke={STEM}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />
      <Leaf x={9} y={15} rotate={-38} scale={0.66} />
      <Leaf x={7} y={17} rotate={148} scale={0.54} fill={LEAF_DEEP} />
      <Leaf x={16} y={9} rotate={-46} scale={0.6} />
      <Tendril x={19} y={8} rotate={-14} scale={0.42} />
      <Bud x={27} y={9} rotate={26} scale={0.62} />
      <Bloom cx={22} cy={5} r={4.2} />
    </svg>
  );
}

/** Larger arrangement for empty states — gives blank panels a reason to exist. */
export function BloomCluster({ size = 124 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 150 108"
      aria-hidden
      focusable="false"
      className="ornament pointer-events-none"
    >
      <path
        d="M75 104 C75 84 66 70 52 60 C40 51 32 42 28 30"
        stroke={STEM}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M75 104 C75 86 84 74 99 66 C112 59 120 50 124 38"
        stroke={STEM}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M75 104 C74 88 74 78 75 62"
        stroke={STEM}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      />
      <Leaf x={54} y={62} rotate={172} scale={2.4} />
      <Leaf x={45} y={47} rotate={-26} scale={1.9} fill={LEAF_DEEP} />
      <Leaf x={40} y={38} rotate={186} scale={1.5} />
      <Leaf x={97} y={66} rotate={8} scale={2.4} />
      <Leaf x={109} y={51} rotate={196} scale={1.9} fill={LEAF_DEEP} />
      <Leaf x={116} y={44} rotate={16} scale={1.5} />
      <Leaf x={74} y={84} rotate={200} scale={1.7} fill={LEAF_DEEP} />
      <Leaf x={76} y={90} rotate={-20} scale={1.7} />
      <Tendril x={64} y={74} rotate={188} scale={1.1} width={1.2} />
      <Tendril x={88} y={78} rotate={-8} scale={1.1} width={1.2} />
      <Bud x={57} y={40} rotate={-30} scale={1.1} />
      <Bud x={98} y={44} rotate={26} scale={1.1} />
      <Bloom cx={26} cy={26} r={12} />
      <Bloom cx={126} cy={34} r={10} />
      <Bloom cx={75} cy={56} r={13} />
    </svg>
  );
}
