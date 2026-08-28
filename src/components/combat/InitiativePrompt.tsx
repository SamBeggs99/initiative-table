import { useMemo, useRef, useState } from 'react';
import {
  buildInitiativePromptRows,
  expandInitiativeValues,
  rollInitiativeFor,
  seedInitiativeValues,
} from '../../lib/initiative-prompt';
import type { Combatant } from '../../types';
import type { SystemAdapter } from '../../systems/types';
import { D20Die } from '../ui/D20Die';
import { Modal } from '../ui/Modal';
import { useRollAnimation } from '../ui/useRollAnimation';

export function InitiativePrompt({
  combatants,
  adapter,
  onConfirm,
  onClose,
}: {
  combatants: Combatant[];
  adapter: Pick<SystemAdapter, 'initiative'>;
  onConfirm: (initiatives: Record<string, number>) => void;
  onClose: () => void;
}) {
  const rows = useMemo(
    () => buildInitiativePromptRows(combatants),
    [combatants],
  );
  const [values, setValues] = useState(() => seedInitiativeValues(rows));
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const { roll, finishTumble, phaseOf, valueFor, spinFor, isBusy } =
    useRollAnimation();

  const map = expandInitiativeValues(rows, values);
  const ready = map != null && rows.length > 0;
  const anyBusy = rows.some((row) => isBusy(row.key));

  const setRow = (key: string, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
  };

  const rollRow = (key: string, representative: Combatant, delay = 0) => {
    const result = rollInitiativeFor(representative, adapter);
    roll(key, result, {
      delay,
      onDone: (final) => setRow(key, String(final)),
    });
  };

  const rollBlanks = () => {
    let i = 0;
    for (const row of rows) {
      if (String(values[row.key] ?? '').trim() === '') {
        rollRow(row.key, row.representative, i * 70);
        i += 1;
      }
    }
  };

  const rollAll = () => {
    rows.forEach((row, i) => {
      rollRow(row.key, row.representative, i * 70);
    });
  };

  const submit = () => {
    const next = expandInitiativeValues(rows, values);
    if (!next) return;
    onConfirm(next);
  };

  return (
    <Modal
      title="Initiative"
      onClose={onClose}
      size="lg"
      variant="glass"
      initialFocusRef={firstFieldRef}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost mr-auto"
            disabled={anyBusy}
            onClick={rollBlanks}
          >
            Roll blanks
          </button>
          <button type="button" className="btn" disabled={anyBusy} onClick={rollAll}>
            Roll all
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || anyBusy}
            onClick={submit}
          >
            Start combat
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Enter everyone’s total, or roll. Ctrl+Enter starts when every row has a
        number.
      </p>
      <ul className="max-h-[min(60vh,28rem)] space-y-1 overflow-auto px-1 py-2">
        {rows.map((row, index) => {
          const phase = phaseOf(row.key);
          const busy = isBusy(row.key);
          return (
            <li
              key={row.key}
              className="flex items-center gap-3 rounded border border-border/70 bg-panel-2/50 px-3 py-2"
            >
              <div className="name-identity min-w-0 flex-1 truncate">{row.label}</div>
              <input
                ref={index === 0 ? firstFieldRef : undefined}
                type="number"
                inputMode="numeric"
                className={`field w-[4.5rem] text-center font-mono-stats tabular-nums ${
                  phase === 'glowing' ? 'field-landed' : ''
                }`}
                aria-label={`Initiative for ${row.label}`}
                readOnly={busy}
                value={values[row.key] ?? ''}
                onChange={(e) => setRow(row.key, e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                className="die-roll-slot btn btn-ghost btn-sm"
                disabled={busy}
                aria-label={
                  busy ? `Rolling for ${row.label}` : `Roll for ${row.label}`
                }
                onClick={() => rollRow(row.key, row.representative)}
              >
                {busy ? (
                  <D20Die
                    value={valueFor(row.key)}
                    rolling={phase === 'rolling'}
                    glowing={phase === 'glowing'}
                    spin={spinFor(row.key)}
                    onTumbleEnd={() => finishTumble(row.key)}
                  />
                ) : (
                  'Roll'
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
