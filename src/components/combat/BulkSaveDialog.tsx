import { useMemo, useState } from 'react';
import {
  damageAfterSave,
  resistanceTier,
  rollAbilitySave,
} from '../../lib/combat';
import type { Ability, Combatant } from '../../types';

interface SaveRow {
  combatantId: string;
  name: string;
  roll: number;
  total: number;
  success: boolean;
  tier: ReturnType<typeof resistanceTier>;
}

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function BulkSaveDialog({
  combatants,
  onApply,
  onClose,
}: {
  combatants: Combatant[];
  onApply: (results: { combatantId: string; damage: number }[]) => void;
  onClose: () => void;
}) {
  const [dc, setDc] = useState(15);
  const [ability, setAbility] = useState<Ability>('dex');
  const [damage, setDamage] = useState(0);
  const [damageType, setDamageType] = useState('');
  const [halfOnSuccess, setHalfOnSuccess] = useState(true);
  const [rows, setRows] = useState<SaveRow[] | null>(null);

  const rollAll = () => {
    setRows(
      combatants.map((c) => {
        const { roll, total } = rollAbilitySave(c, ability);
        return {
          combatantId: c.id,
          name: c.name,
          roll,
          total,
          success: total >= dc,
          tier: resistanceTier(c, damageType),
        };
      }),
    );
  };

  const preview = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => ({
      ...r,
      applied: damageAfterSave({
        baseDamage: damage,
        saved: r.success,
        halfOnSuccess,
        tier: r.tier,
      }),
    }));
  }, [rows, damage, halfOnSuccess]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-save-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 id="bulk-save-title" className="text-sm font-semibold text-text">
            Bulk save ({combatants.length})
          </h2>
          <button
            type="button"
            className="text-sm text-muted"
            onClick={onClose}
          >
            Esc
          </button>
        </div>

        <div className="space-y-3 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              DC
              <input
                type="number"
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                value={dc}
                onChange={(e) => setDc(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-muted">
              Ability
              <select
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={ability}
                onChange={(e) => setAbility(e.target.value as Ability)}
              >
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Damage
              <input
                type="number"
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                value={damage}
                onChange={(e) => setDamage(Number(e.target.value) || 0)}
              />
            </label>
            <label className="text-xs text-muted">
              Type (for resistance)
              <input
                className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                value={damageType}
                onChange={(e) => setDamageType(e.target.value)}
                placeholder="fire"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={halfOnSuccess}
              onChange={(e) => setHalfOnSuccess(e.target.checked)}
            />
            Half damage on success (full on fail)
          </label>

          <button
            type="button"
            className="btn btn-accent"
            onClick={rollAll}
          >
            Roll all saves
          </button>

          {preview.length > 0 && (
            <ul className="space-y-1 font-mono-stats text-xs tabular-nums">
              {preview.map((r) => (
                <li key={r.combatantId} className="flex justify-between gap-2">
                  <span className="truncate text-text">{r.name}</span>
                  <span className={r.success ? 'text-heal' : 'text-damage'}>
                    {r.roll}→{r.total} {r.success ? 'OK' : 'FAIL'}
                    {r.tier !== 'normal' ? ` [${r.tier}]` : ''} → {r.applied} dmg
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!preview.length || damage <= 0}
              className="rounded border border-damage px-2 py-1 text-xs text-damage disabled:opacity-40"
              onClick={() => {
                onApply(
                  preview.map((r) => ({
                    combatantId: r.combatantId,
                    damage: r.applied,
                  })),
                );
                onClose();
              }}
            >
              Apply damage
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
