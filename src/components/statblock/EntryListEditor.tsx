import { useEffect, useRef, useState } from 'react';
import { DAMAGE_TYPES, entryDamageParts } from '../../lib/damage-types';
import {
  attackBonusFromDesc,
  damagePartsFromDesc,
  durationFromDesc,
  requirementsFromDesc,
} from '../../lib/parse';
import { formatModifier } from '../../lib/statblock-derived';
import type { DamagePart, Entry } from '../../types';

interface EntryListEditorProps {
  label: string;
  entries: Entry[];
  onChange: (entries: Entry[]) => void;
  /** Optional PF2e action-cost editor keyed by action name. */
  actionCosts?: Record<string, 1 | 2 | 3 | 'reaction' | 'free'>;
  onActionCostsChange?: (costs: Record<string, 1 | 2 | 3 | 'reaction' | 'free'>) => void;
  showActionCosts?: boolean;
  /** Structured damage amount + type (Actions). */
  showDamage?: boolean;
  /** Checkbox + note for special use conditions. */
  showRequirements?: boolean;
  /** Checkbox + note for how long the activity takes or lasts. */
  showDuration?: boolean;
  /** Attack-bonus field (Spell DC belongs on the Spells section). */
  showOffense?: boolean;
}

export function EntryListEditor({
  label,
  entries,
  onChange,
  actionCosts,
  onActionCostsChange,
  showActionCosts,
  showDamage,
  showRequirements,
  showDuration,
  showOffense,
}: EntryListEditorProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [focusNew, setFocusNew] = useState(false);

  const addEntry = () => {
    const name =
      label.toLowerCase() === 'actions'
        ? 'New action'
        : label.toLowerCase() === 'reactions'
          ? 'New reaction'
          : 'New entry';
    onChange([...entries, { name, desc: '' }]);
    setFocusNew(true);
  };

  useEffect(() => {
    if (!focusNew) return;
    setFocusNew(false);
    const input = listRef.current?.querySelector(
      'li:last-of-type input',
    ) as HTMLInputElement | null;
    input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input?.focus();
    input?.select();
  }, [entries, focusNew]);

  const update = (index: number, patch: Partial<Entry>) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    onChange(next);
  };

  const remove = (index: number) => {
    const removed = entries[index];
    onChange(entries.filter((_, i) => i !== index));
    if (removed && actionCosts && onActionCostsChange) {
      const next = { ...actionCosts };
      delete next[removed.name];
      onActionCostsChange(next);
    }
  };

  /** Damage rows as edited: row 0 is Entry.damage, the rest are riders. */
  const damageRows = (entry: Entry): DamagePart[] => [
    entry.damage ?? { expr: '', type: 'slashing' },
    ...(entry.extraDamage ?? []),
  ];

  const writeDamage = (index: number, rows: DamagePart[]) => {
    const [first, ...extra] = rows;
    const kept = extra.filter((p) => p.expr.trim() || p.type.trim());
    const primary =
      first && (first.expr.trim() || first.type.trim()) ? first : undefined;
    // A rider with no primary would never roll — promote it instead.
    const [head, ...tail] = primary ? [primary, ...kept] : kept;
    update(index, {
      damage: head,
      extraDamage: tail.length > 0 ? tail : undefined,
    });
  };

  const patchDamage = (
    index: number,
    row: number,
    patch: Partial<DamagePart>,
  ) => {
    const rows = damageRows(entries[index]!);
    writeDamage(
      index,
      rows.map((p, i) => (i === row ? { ...p, ...patch } : p)),
    );
  };

  const addDamageRow = (index: number) => {
    writeDamage(index, [
      ...damageRows(entries[index]!),
      { expr: '', type: 'fire' },
    ]);
  };

  const removeDamageRow = (index: number, row: number) => {
    writeDamage(
      index,
      damageRows(entries[index]!).filter((_, i) => i !== row),
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</h3>
        <button type="button" className="btn btn-sm" onClick={addEntry}>
          Add
        </button>
      </div>
      {entries.length === 0 && <p className="text-xs text-muted">None yet.</p>}
      <ul ref={listRef} className="space-y-2">
        {entries.map((entry, index) => (
          <li key={`${label}-${index}`} className="card p-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <input
                className="min-w-0 flex-1 rounded border border-border bg-panel px-2 py-1 text-sm text-text"
                value={entry.name}
                onChange={(e) => {
                  const oldName = entry.name;
                  const name = e.target.value;
                  update(index, { name });
                  if (showActionCosts && actionCosts && onActionCostsChange && oldName !== name) {
                    const next = { ...actionCosts };
                    if (oldName in next) {
                      next[name] = next[oldName]!;
                      delete next[oldName];
                      onActionCostsChange(next);
                    }
                  }
                }}
                placeholder="Name"
              />
              {showActionCosts && onActionCostsChange && (
                <select
                  className="field px-1.5 py-1 text-xs"
                  value={actionCosts?.[entry.name] ?? 1}
                  onChange={(e) => {
                    const v = e.target.value;
                    const cost =
                      v === 'reaction' || v === 'free'
                        ? v
                        : (Number(v) as 1 | 2 | 3);
                    onActionCostsChange({
                      ...(actionCosts ?? {}),
                      [entry.name]: cost,
                    });
                  }}
                  title="Action cost"
                >
                  <option value={1}>◆ 1</option>
                  <option value={2}>◆◆ 2</option>
                  <option value={3}>◆◆◆ 3</option>
                  <option value="reaction">↺ R</option>
                  <option value="free">◇ F</option>
                </select>
              )}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => move(index, 1)}
                disabled={index === entries.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => remove(index)}
                aria-label="Remove"
              >
                ×
              </button>
            </div>

            {showDamage && (
              <div className="mb-1.5 space-y-1">
                {damageRows(entry).map((part, row) => (
                  <div
                    key={`damage-${row}`}
                    className="flex flex-wrap items-end gap-1.5"
                  >
                    <label className="min-w-[6.5rem] flex-1 text-[10px] text-muted">
                      {row === 0 ? 'Damage' : 'plus'}
                      <input
                        className="field mt-0.5 w-full py-1 font-mono-stats text-xs tabular-nums"
                        value={part.expr}
                        placeholder={row === 0 ? '2d6+3 or 8' : '1d6'}
                        onChange={(e) =>
                          patchDamage(index, row, { expr: e.target.value })
                        }
                      />
                    </label>
                    <label className="min-w-[7.5rem] flex-1 text-[10px] text-muted">
                      Type
                      <select
                        className="field mt-0.5 w-full py-1 text-xs"
                        value={part.type || ''}
                        onChange={(e) =>
                          patchDamage(index, row, { type: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        {DAMAGE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    {row === 0 ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          title="Add another damage die — rolled and resisted on its own"
                          onClick={() => addDamageRow(index)}
                        >
                          + die
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          title="Fill damage from the description’s Hit: line"
                          onClick={() => {
                            const detected = damagePartsFromDesc(entry.desc);
                            if (detected.length === 0) return;
                            writeDamage(index, detected);
                          }}
                        >
                          From desc
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        aria-label={`Remove damage ${row + 1}`}
                        onClick={() => removeDamageRow(index, row)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {entryDamageParts(entry).length > 1 && (
                  <p className="text-[10px] text-muted">
                    Each die rolls separately and lands with its own type.
                  </p>
                )}
              </div>
            )}

            {showOffense && (
              <div className="mb-1.5 flex flex-wrap items-end gap-1.5">
                <label className="w-[5.5rem] text-[10px] text-muted">
                  Attack
                  <input
                    type="number"
                    className="field mt-0.5 w-full py-1 font-mono-stats text-xs tabular-nums"
                    value={entry.attackBonus ?? ''}
                    placeholder="+7"
                    onChange={(e) => {
                      const raw = e.target.value;
                      update(index, {
                        attackBonus: raw === '' ? undefined : Number(raw),
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  title="Fill attack bonus from the description"
                  onClick={() => {
                    const attackBonus = attackBonusFromDesc(entry.desc);
                    if (attackBonus == null) return;
                    update(index, { attackBonus });
                  }}
                >
                  From desc
                </button>
                {entry.attackBonus != null && (
                  <span className="mb-1 font-mono-stats text-[11px] tabular-nums text-muted">
                    {formatModifier(entry.attackBonus)}
                  </span>
                )}
              </div>
            )}

            {showRequirements && (
              <div className="mb-1.5 space-y-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-accent)]"
                    checked={entry.requirements !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const fromDesc = requirementsFromDesc(entry.desc);
                        update(index, { requirements: fromDesc ?? '' });
                      } else {
                        update(index, { requirements: undefined });
                      }
                    }}
                  />
                  Requirements
                </label>
                {entry.requirements !== undefined && (
                  <div className="flex flex-wrap items-start gap-1.5">
                    <input
                      className="field min-w-0 flex-1 py-1 text-xs"
                      value={entry.requirements}
                      placeholder="e.g. You are holding a weapon, or the target is grappled"
                      onChange={(e) =>
                        update(index, { requirements: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      title="Fill from a Requirements / Prerequisite line in the description"
                      onClick={() => {
                        const detected = requirementsFromDesc(entry.desc);
                        if (!detected) return;
                        update(index, { requirements: detected });
                      }}
                    >
                      From desc
                    </button>
                  </div>
                )}
              </div>
            )}

            {showDuration && (
              <div className="mb-1.5 space-y-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-accent)]"
                    checked={entry.duration !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const fromDesc = durationFromDesc(entry.desc);
                        update(index, { duration: fromDesc ?? '' });
                      } else {
                        update(index, { duration: undefined });
                      }
                    }}
                  />
                  Time
                </label>
                {entry.duration !== undefined && (
                  <div className="flex flex-wrap items-start gap-1.5">
                    <input
                      className="field min-w-0 flex-1 py-1 text-xs"
                      value={entry.duration}
                      placeholder="e.g. 1 minute, 10 minutes, until end of turn"
                      onChange={(e) =>
                        update(index, { duration: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      title="Fill from a Duration line in the description"
                      onClick={() => {
                        const detected = durationFromDesc(entry.desc);
                        if (!detected) return;
                        update(index, { duration: detected });
                      }}
                    >
                      From desc
                    </button>
                  </div>
                )}
              </div>
            )}

            <textarea
              className="min-h-16 w-full rounded border border-border bg-panel px-2 py-1 text-sm text-text"
              value={entry.desc}
              onChange={(e) => update(index, { desc: e.target.value })}
              placeholder="Description"
            />
          </li>
        ))}
      </ul>
      {entries.length > 0 && (
        <button type="button" className="btn btn-sm w-full" onClick={addEntry}>
          Add another
        </button>
      )}
    </section>
  );
}
