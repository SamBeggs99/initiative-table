import { type CSSProperties } from 'react';
import { hitEffect, type HitEffectSpec } from '../../lib/hit-effects';

/**
 * The light-and-motion layer for one hit on one combat row.
 *
 * Sits absolutely inside `.row-combat` (which is already `position: relative;
 * overflow: hidden`), never takes pointer events, and animates only `transform`
 * and `opacity` so twenty of these firing at once — an AoE against a full
 * selection — stay on the compositor.
 *
 * The `key` the caller passes is what restarts it: the tracker bumps a sequence
 * number per hit, so a second hit on the same row replays rather than being
 * swallowed by a still-running animation.
 */
export function HitEffect({
  type,
  /** Overrides the resolved spec. The gallery uses this to force a motion. */
  spec: override,
}: {
  type?: string;
  spec?: HitEffectSpec;
}) {
  const spec = override ?? hitEffect(type);
  const { motion, color, particles, durationMs, emphatic } = spec;

  const style = {
    '--fx': color,
    '--fx-ms': `${durationMs}ms`,
  } as CSSProperties;

  return (
    <div
      className={`hit-fx hit-fx-${motion}${emphatic ? ' hit-fx-emphatic' : ''}`}
      style={style}
      aria-hidden
    >
      {/* The wash every motion sits on. Tinted, brief, and behind the particles. */}
      <span className="hit-fx-wash" />

      {particles > 0 &&
        Array.from({ length: particles }, (_, i) => (
          <span
            key={i}
            className="hit-fx-bit"
            style={
              {
                // Staggered along the row and in time, so the motion reads as
                // several things happening rather than one block moving.
                '--i': i,
                '--n': particles,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
