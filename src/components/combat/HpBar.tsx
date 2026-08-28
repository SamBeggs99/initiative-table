import { hpBarTone } from '../../lib/combat';
import type { Combatant } from '../../types';

const TONE_GRADIENT: Record<string, string> = {
  green: 'linear-gradient(90deg, #10b981, #34d399)',
  amber: 'linear-gradient(90deg, #d97706, #fbbf24)',
  red: 'linear-gradient(90deg, #e11d48, #ff5d6c)',
};

export function HpBar({ combatant }: { combatant: Combatant }) {
  const tone = hpBarTone(combatant);
  const pct =
    combatant.maxHp > 0
      ? Math.max(0, Math.min(100, (combatant.hp / combatant.maxHp) * 100))
      : 0;
  const tempPct =
    combatant.maxHp > 0 && combatant.tempHp > 0
      ? Math.max(0, Math.min(100 - pct, (combatant.tempHp / combatant.maxHp) * 100))
      : 0;

  return (
    <div className="hp-track" aria-hidden>
      <div
        className="hp-fill"
        style={{
          width: `${pct}%`,
          background: TONE_GRADIENT[tone] ?? 'var(--color-border)',
          boxShadow:
            pct > 0 ? '0 0 8px -1px color-mix(in srgb, currentColor 60%, transparent)' : undefined,
        }}
      />
      {tempPct > 0 && (
        <div
          className="hp-fill bg-accent/60"
          style={{ width: `${tempPct}%` }}
        />
      )}
    </div>
  );
}
