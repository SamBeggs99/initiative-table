import { useCallback, useState } from 'react';
import { DAMAGE_TYPES } from '../lib/damage-types';
import { ALL_HIT_MOTIONS, hitEffect, type HitMotion } from '../lib/hit-effects';
import { HitEffect } from './combat/HitEffect';
import { DeathSavePips } from './combat/DeathSavePips';
import { HpBar } from './combat/HpBar';
import type { Combatant } from '../types';

/**
 * Every hit effect, replayable side by side.
 *
 * The reason this exists rather than a written description: motion cannot be
 * reviewed in a diff. Twelve of these firing next to each other is the only way
 * to tell whether fire actually reads as fire, and whether a crit is louder
 * than a hit without being obnoxious.
 */

/** One damage type per motion family, for the compact grid. */
const REPRESENTATIVE: { motion: HitMotion; sample: string; note: string }[] = [
  { motion: 'rise', sample: 'fire', note: 'fire · acid · poison · spirit' },
  { motion: 'mend', sample: 'heal', note: 'healing' },
  { motion: 'ward', sample: 'temp', note: 'temp HP' },
  { motion: 'frost', sample: 'cold', note: 'cold' },
  { motion: 'crackle', sample: 'lightning', note: 'lightning' },
  { motion: 'shock', sample: 'thunder', note: 'thunder · force' },
  { motion: 'bloom', sample: 'radiant', note: 'radiant · vitality' },
  { motion: 'wither', sample: 'necrotic', note: 'necrotic · void' },
  { motion: 'ripple', sample: 'psychic', note: 'psychic · mental' },
  { motion: 'slash', sample: 'slashing', note: 'slashing' },
  { motion: 'impact', sample: 'piercing', note: 'piercing · bludgeoning' },
  { motion: 'drip', sample: 'bleed', note: 'bleed' },
];

const OUTCOMES = ['crit', 'miss'] as const;

/** A stand-in combat row, so an effect is judged in the place it will live. */
function SampleRow({
  label,
  sub,
  playKey,
  type,
  hp = '18 / 34',
}: {
  label: string;
  sub?: string;
  playKey: number;
  type: string;
  hp?: string;
}) {
  return (
    <div className="row-combat rounded border border-border px-3 py-2">
      {playKey > 0 && <HitEffect key={playKey} type={type} />}
      <div className="relative z-[2] flex items-center gap-2.5">
        <span className="init-pill">14</span>
        <span className="h-4 w-[3px] shrink-0 rounded-full bg-damage" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-semibold">{label}</div>
          {sub && <div className="text-[10px] text-muted">{sub}</div>}
        </div>
        <span className="font-mono-stats text-sm tabular-nums text-muted">{hp}</span>
      </div>
    </div>
  );
}

export function HitEffectGallery() {
  const [seq, setSeq] = useState(0);
  const [soloed, setSoloed] = useState<string | null>(null);

  const playAll = useCallback(() => setSeq((n) => n + 1), []);
  const solo = useCallback((type: string) => {
    setSoloed(type);
    setSeq((n) => n + 1);
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-title section-title-leaf">Hit effects</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            Colour says which damage type; <b>motion</b> says what happened.
            Twelve families rather than eighteen bespoke animations, so the eye
            can learn them. Everything animates transform and opacity only —
            an AoE on twenty rows stays on the compositor.
          </p>
        </div>
        <button type="button" className="btn btn-accent" onClick={playAll}>
          ▶ Replay all
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {REPRESENTATIVE.map((r) => {
          const spec = hitEffect(r.sample);
          return (
            <button
              key={r.motion}
              type="button"
              className="block w-full text-left"
              title={`Replay ${r.motion}`}
              onClick={() => solo(r.sample)}
            >
              <SampleRow
                label={r.motion}
                sub={`${r.note} · ${spec.durationMs}ms`}
                playKey={soloed === null || soloed === r.sample ? seq : 0}
                type={r.sample}
              />
            </button>
          );
        })}
      </div>

      <h3 className="section-title mt-4">Outcomes</h3>
      <p className="text-xs leading-relaxed text-muted">
        A crit is the loudest thing on the tape and a miss the quietest — a miss
        that flashes as hard as a hit teaches the eye the wrong lesson.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            className="block w-full text-left"
            onClick={() => solo(o)}
          >
            <SampleRow
              label={o === 'crit' ? 'Critical hit' : 'Miss'}
              sub={
                o === 'crit'
                  ? 'amber, wider rings, brighter front'
                  : 'grey, 300ms, no damage applied'
              }
              playKey={soloed === null || soloed === o ? seq : 0}
              type={o}
            />
          </button>
        ))}
      </div>

      <h3 className="section-title mt-4">Every damage type</h3>
      <p className="text-xs leading-relaxed text-muted">
        All {DAMAGE_TYPES.length} types mapped onto their family. Click any row
        to replay just that one.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {DAMAGE_TYPES.map((t) => {
          const spec = hitEffect(t);
          return (
            <button
              key={t}
              type="button"
              className="row-combat relative overflow-hidden rounded border border-border px-2.5 py-1.5 text-left"
              onClick={() => solo(t)}
              title={`${t} · ${spec.motion}`}
            >
              {(soloed === null || soloed === t) && seq > 0 && (
                <HitEffect key={seq} type={t} />
              )}
              <span className="relative z-[2] flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium capitalize">{t}</span>
                <span className="font-mono-stats text-[10px] text-muted">
                  {spec.motion}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="section-title mt-4">State contrast</h3>
      <p className="text-xs leading-relaxed text-muted">
        The tape had one visual register and needed three: idle, whose turn it
        is, and something just happened. These are the first two — the active
        row now lifts off the page rather than carrying a 4px rail.
      </p>

      <div className="space-y-1 rounded border border-border p-2">
        <div className="row-combat rounded px-3 py-2">
          <div className="relative z-[2] flex items-center gap-2.5">
            <span className="init-pill">18</span>
            <span className="h-4 w-[3px] rounded-full bg-condition" />
            <span className="flex-1 text-[0.95rem]">Idle row</span>
            <span className="font-mono-stats text-sm tabular-nums text-muted">
              24 / 24
            </span>
          </div>
        </div>
        <div className="row-active row-combat rounded px-3 py-2">
          <div className="relative z-[2] flex items-center gap-2.5">
            <span className="init-pill init-pill-active">16</span>
            <span className="h-4 w-[3px] rounded-full bg-heal" />
            <span className="flex-1 text-[0.95rem] font-semibold">Their turn</span>
            <span className="font-mono-stats text-sm tabular-nums">18 / 34</span>
          </div>
        </div>
        <div className="row-combat rounded px-3 py-2">
          <div className="relative z-[2] flex items-center gap-2.5">
            <span className="init-pill">12</span>
            <span className="h-4 w-[3px] rounded-full bg-damage" />
            <span className="flex-1 text-[0.95rem]">Idle row</span>
            <span className="font-mono-stats text-sm tabular-nums text-muted">
              7 / 7
            </span>
          </div>
        </div>
      </div>

      <h3 className="section-title mt-4">HP bar &amp; death saves</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card space-y-2 p-3">
          <p className="text-[11px] leading-relaxed text-muted">
            A tick at the halfway mark, so &ldquo;one more hit and they are
            bloodied&rdquo; is something you see rather than work out.
          </p>
          {[
            { hp: 34, maxHp: 34, label: 'Healthy' },
            { hp: 20, maxHp: 34, label: 'Above half' },
            { hp: 14, maxHp: 34, label: 'Bloodied' },
            { hp: 4, maxHp: 34, label: 'Badly bloodied' },
          ].map((c) => (
            <div key={c.label} className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted">
                <span>{c.label}</span>
                <span className="font-mono-stats tabular-nums">
                  {c.hp} / {c.maxHp}
                </span>
              </div>
              <HpBar combatant={{ ...c, tempHp: 0 } as unknown as Combatant} />
            </div>
          ))}
        </div>
        <div className="card space-y-2.5 p-3">
          <p className="text-[11px] leading-relaxed text-muted">
            Death saves as marks, not glyph strings. The third failure is drawn
            heavier — it is the one that ends the character.
          </p>
          {(
            [
              [0, 0],
              [1, 1],
              [2, 1],
              [0, 2],
              [3, 0],
              [0, 3],
            ] as [number, number][]
          ).map(([sv, fl]) => (
            <div key={`${sv}-${fl}`} className="flex items-center gap-3">
              <span className="w-12 font-mono-stats text-[10px] tabular-nums text-muted">
                {sv}s / {fl}f
              </span>
              <DeathSavePips successes={sv} failures={fl} />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Under <code className="font-mono-stats">prefers-reduced-motion</code> the
        particles are removed and each effect becomes a static tinted hold with a
        coloured edge — the damage-type read survives, the travel does not. The
        blanket reduced-motion rule would otherwise have deleted the cue
        entirely. {ALL_HIT_MOTIONS.length} motions in total.
      </p>
    </section>
  );
}
