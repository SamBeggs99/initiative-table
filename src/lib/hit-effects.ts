import { DAMAGE_TYPE_FLASH, type DamageType } from './damage-types';

/**
 * How a hit *moves*, as distinct from what colour it is.
 *
 * Colour already carries the damage type (DAMAGE_TYPE_FLASH), but eighteen
 * tinted versions of one fade read as eighteen shades of "something happened".
 * Motion is the channel that says *what* happened, and it survives a glance
 * from across the table in a way a hue does not.
 *
 * Types are grouped into families rather than given bespoke animations each —
 * ten motions the eye can learn, not eighteen it cannot.
 */
export type HitMotion =
  /** Licks climbing from the bottom edge. Fire, acid, poison, spirit. */
  | 'rise'
  /**
   * Leaves drifting up through a soft bloom. Healing.
   *
   * Healing gets its own motion rather than a green 'rise', because recolouring
   * fire reads as being set alight in a nicer hue. Slower, unhurried, and drawn
   * from the app's botanical vocabulary — new growth rather than a hit.
   */
  | 'mend'
  /** A shell gathering at the edges and holding. Temporary hit points. */
  | 'ward'
  /** Crystals closing in from the edges, then settling. Cold. */
  | 'frost'
  /** Two or three staccato streaks. Lightning. */
  | 'crackle'
  /** Concentric rings driven outward. Thunder, force. */
  | 'shock'
  /** A soft glow opening from the centre. Radiant, vitality. */
  | 'bloom'
  /** A vignette closing inward, draining the row. Necrotic, void. */
  | 'wither'
  /** Undulating bands crossing the row. Psychic, mental. */
  | 'ripple'
  /** One fast diagonal cut. Slashing. */
  | 'slash'
  /** A narrow spike driven in from the strike side. Piercing, bludgeoning. */
  | 'impact'
  /** Beads running down the row. Bleed. */
  | 'drip'
  /**
   * The colour draining out of the row as it settles. An enemy dropping.
   *
   * Death is not a hit — it is the end of one, and it deserves a different
   * beat: no strike, no particles, just the row going out. Runs once as the
   * transition into the persistent .row-dead state.
   */
  | 'expire'
  /**
   * An urgent double pulse. A PC hitting 0 and starting death saves.
   *
   * Deliberately unlike 'expire': a downed hero is a problem to solve this
   * round, not a thing that is over, so it reads as an alarm rather than a
   * fade.
   */
  | 'collapse';

const MOTION_BY_TYPE: Record<DamageType, HitMotion> = {
  slashing: 'slash',
  piercing: 'impact',
  bludgeoning: 'impact',
  fire: 'rise',
  cold: 'frost',
  lightning: 'crackle',
  thunder: 'shock',
  acid: 'rise',
  poison: 'rise',
  necrotic: 'wither',
  radiant: 'bloom',
  psychic: 'ripple',
  force: 'shock',
  bleed: 'drip',
  spirit: 'rise',
  mental: 'ripple',
  vitality: 'bloom',
  void: 'wither',
};

/** Outcomes are not damage types, but they use the same layer. */
export type HitKind =
  | DamageType
  | 'heal'
  | 'temp'
  | 'slain'
  | 'downed'
  | 'crit'
  | 'miss'
  | 'untyped';

export interface HitEffectSpec {
  kind: HitKind;
  motion: HitMotion;
  /** Primary colour. A CSS colour or a var() reference. */
  color: string;
  /** How many staggered particles the motion wants. 0 for pure gradients. */
  particles: number;
  /** Duration in ms. Longer for effects that settle, shorter for strikes. */
  durationMs: number;
  /** Louder treatment: thicker light, larger travel. Crits only. */
  emphatic: boolean;
}

const MOTION_PARTICLES: Record<HitMotion, number> = {
  expire: 0,
  collapse: 0,
  rise: 5,
  mend: 6,
  ward: 0,
  frost: 6,
  crackle: 3,
  shock: 3,
  bloom: 0,
  wither: 0,
  ripple: 3,
  slash: 1,
  impact: 1,
  drip: 4,
};

const MOTION_DURATION: Record<HitMotion, number> = {
  // Long and unhurried: this is a punctuation mark, not a hit.
  expire: 900,
  // Two pulses, fast enough to read as urgent.
  collapse: 820,
  rise: 760,
  // Longest on the tape. Damage is an event; healing is a relief, and it should
  // take its time about it.
  mend: 1040,
  ward: 620,
  frost: 820,
  crackle: 420,
  shock: 560,
  bloom: 700,
  wither: 780,
  ripple: 720,
  slash: 380,
  impact: 340,
  drip: 800,
};

function isDamageType(value: string): value is DamageType {
  return value in MOTION_BY_TYPE;
}

/**
 * Resolve the effect for a hit. `type` is whatever the damage field or action
 * clause produced, plus the two synthetic outcomes the tracker sends: 'crit'
 * and 'miss'.
 */
export function hitEffect(type?: string): HitEffectSpec {
  const key = (type ?? '').trim().toLowerCase();

  if (key === 'crit') {
    return {
      kind: 'crit',
      motion: 'shock',
      color: 'var(--color-amber)',
      particles: 4,
      durationMs: 720,
      emphatic: true,
    };
  }

  if (key === 'miss') {
    // Deliberately the quietest thing on the tape: nothing landed, and a miss
    // that flashes as hard as a hit teaches the eye the wrong lesson.
    return {
      kind: 'miss',
      motion: 'slash',
      color: 'var(--color-muted)',
      particles: 1,
      durationMs: 300,
      emphatic: false,
    };
  }

  // An enemy dropping. Grey rather than red — the fight left it, and red would
  // read as one more hit.
  if (key === 'slain') {
    return {
      kind: 'slain',
      motion: 'expire',
      color: 'var(--color-muted)',
      particles: 0,
      durationMs: MOTION_DURATION.expire,
      emphatic: false,
    };
  }

  // A PC hitting 0. Amber, because this is a warning, not a conclusion.
  if (key === 'downed') {
    return {
      kind: 'downed',
      motion: 'collapse',
      color: 'var(--color-amber)',
      particles: 0,
      durationMs: MOTION_DURATION.collapse,
      emphatic: true,
    };
  }

  if (key === 'heal') {
    return {
      kind: 'heal',
      motion: 'mend',
      color: 'var(--color-heal)',
      particles: MOTION_PARTICLES.mend,
      durationMs: MOTION_DURATION.mend,
      emphatic: false,
    };
  }

  // Temp HP is not healing — it does not move the HP bar — so it gets its own
  // read, in the accent the app already uses for temp and shields.
  if (key === 'temp') {
    return {
      kind: 'temp',
      motion: 'ward',
      color: 'var(--color-accent-2)',
      particles: MOTION_PARTICLES.ward,
      durationMs: MOTION_DURATION.ward,
      emphatic: false,
    };
  }

  if (isDamageType(key)) {
    const motion = MOTION_BY_TYPE[key];
    return {
      kind: key,
      motion,
      color: DAMAGE_TYPE_FLASH[key],
      particles: MOTION_PARTICLES[motion],
      durationMs: MOTION_DURATION[motion],
      emphatic: false,
    };
  }

  // Untyped damage keeps the original behaviour: a plain red wash.
  return {
    kind: 'untyped',
    motion: 'impact',
    color: 'var(--color-damage)',
    particles: 1,
    durationMs: 420,
    emphatic: false,
  };
}

/** Every distinct motion, for the design gallery. */
export const ALL_HIT_MOTIONS: HitMotion[] = [
  'rise',
  'expire',
  'collapse',
  'mend',
  'ward',
  'frost',
  'crackle',
  'shock',
  'bloom',
  'wither',
  'ripple',
  'slash',
  'impact',
  'drip',
];
