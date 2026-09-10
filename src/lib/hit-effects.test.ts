import { describe, expect, it } from 'vitest';
import { DAMAGE_TYPES } from './damage-types';
import { ALL_HIT_MOTIONS, hitEffect } from './hit-effects';

describe('every damage type resolves', () => {
  it('maps all 18 types to a known motion with a colour and a duration', () => {
    for (const type of DAMAGE_TYPES) {
      const spec = hitEffect(type);
      expect(ALL_HIT_MOTIONS).toContain(spec.motion);
      expect(spec.color).toBeTruthy();
      expect(spec.durationMs).toBeGreaterThan(0);
      expect(spec.kind).toBe(type);
    }
  });

  it('is case- and whitespace-insensitive, like the damage field', () => {
    expect(hitEffect('  FIRE ').motion).toBe('rise');
    expect(hitEffect('Cold').motion).toBe('frost');
  });

  it('falls back to a plain red impact for untyped damage', () => {
    for (const input of [undefined, '', '   ', 'sonic', 'nonsense']) {
      const spec = hitEffect(input);
      expect(spec.kind).toBe('untyped');
      expect(spec.color).toBe('var(--color-damage)');
    }
  });
});

describe('motion families group sensibly', () => {
  const motionOf = (t: string) => hitEffect(t).motion;

  it('sends everything that should climb to rise', () => {
    for (const t of ['fire', 'acid', 'poison', 'spirit']) {
      expect(motionOf(t)).toBe('rise');
    }
  });

  it('gives healing its own motion, not a green fire', () => {
    expect(motionOf('heal')).toBe('mend');
    expect(motionOf('heal')).not.toBe(motionOf('fire'));
  });

  it('gives temp HP its own motion, because it is not healing', () => {
    expect(motionOf('temp')).toBe('ward');
    expect(motionOf('temp')).not.toBe(motionOf('heal'));
  });

  it('shares one motion between thunder and force', () => {
    expect(motionOf('thunder')).toBe('shock');
    expect(motionOf('force')).toBe('shock');
  });

  it('pairs the PF2e types with their 5e equivalents', () => {
    expect(motionOf('mental')).toBe(motionOf('psychic'));
    expect(motionOf('vitality')).toBe(motionOf('radiant'));
    expect(motionOf('void')).toBe(motionOf('necrotic'));
  });
});

describe('outcome emphasis', () => {
  it('makes a crit the loudest thing on the tape', () => {
    const crit = hitEffect('crit');
    expect(crit.emphatic).toBe(true);
    expect(crit.color).toBe('var(--color-amber)');
    // Louder than the ordinary version of the same motion.
    expect(crit.particles).toBeGreaterThan(hitEffect('thunder').particles);
  });

  it('makes a miss the quietest', () => {
    const miss = hitEffect('miss');
    expect(miss.emphatic).toBe(false);
    expect(miss.color).toBe('var(--color-muted)');
    // Shorter than every damage type, so nothing landing reads as nothing.
    const shortestHit = Math.min(
      ...DAMAGE_TYPES.map((t) => hitEffect(t).durationMs),
    );
    expect(miss.durationMs).toBeLessThan(shortestHit);
  });

  it('lets healing linger longer than any hit', () => {
    const longestHit = Math.max(
      ...DAMAGE_TYPES.map((t) => hitEffect(t).durationMs),
    );
    expect(hitEffect('heal').durationMs).toBeGreaterThan(longestHit);
  });
});

describe('durations stay inside a usable band', () => {
  it('never outlasts a turn or flickers past unseen', () => {
    const kinds = [...DAMAGE_TYPES, 'heal', 'temp', 'crit', 'miss', undefined];
    for (const k of kinds) {
      const { durationMs } = hitEffect(k);
      expect(durationMs).toBeGreaterThanOrEqual(300);
      expect(durationMs).toBeLessThanOrEqual(1200);
    }
  });

  it('asks for a sane particle count — these all animate at once in an AoE', () => {
    for (const t of [...DAMAGE_TYPES, 'heal', 'temp', 'crit', 'miss']) {
      const { particles } = hitEffect(t);
      expect(particles).toBeGreaterThanOrEqual(0);
      expect(particles).toBeLessThanOrEqual(8);
    }
  });
});
