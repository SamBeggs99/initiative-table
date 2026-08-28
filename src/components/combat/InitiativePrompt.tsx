import { useMemo, useRef, useState } from 'react';
import {
  buildInitiativePromptRows,
  expandInitiativeValues,
  rollInitiativeFor,
  rowRoleLabel,
  seedInitiativeValues,
} from '../../lib/initiative-prompt';
import type { Combatant } from '../../types';
import type { SystemAdapter } from '../../systems/types';
import { Modal } from '../ui/Modal';

export function InitiativePrompt({
  combatants,
  adapter,
  onConfirm,
  onClose,
}: {
  combatants: Combatant[];
  adapter: Pick<SystemAdapter, 'initiative' | 'initiativeIsRolled'>;
  onConfirm: (initiatives: Record<string, number>) => void;
  onClose: () => void;
}) {
  const rows = useMemo(
    () =>
      buildInitiativePromptRows(combatants, {
        rolled: adapter.initiativeIsRolled,
      }),
    [combatants, adapter.initiativeIsRolled],
  );
  const [values, setValues] = useState(() => seedInitiativeValues(rows));
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const map = expandInitiativeValues(rows, values);
  const ready = map != null && rows.length > 0;

  const setRow = (key: string, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
  };

  const rollRow = (key: string, representative: Combatant) => {
    setRow(key, String(rollInitiativeFor(representative, adapter)));
  };

  const rollBlanks = () => {
    setValues((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (String(next[row.key] ?? '').trim() === '') {
          next[row.key] = String(
            rollInitiativeFor(row.representative, adapter),
          );
        }
      }
      return next;
    });
  };

  const rollAll = () => {
    setValues(() => {
      const next: Record<string, string> = {};
      for (const row of rows) {
        next[row.key] = String(rollInitiativeFor(row.representative, adapter));
      }
      return next;
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
      initialFocusRef={firstFieldRef}
      footer={
        <>
          <button type="button" className="btn btn-ghost mr-auto" onClick={rollBlanks}>
            Roll blanks
          </button>
          <button type="button" className="btn" onClick={rollAll}>
            Roll all
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={submit}
          >
            Start combat
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Enter everyone’s total, or roll. Each combatant needs their own score.
        Ctrl+Enter starts when every row has a number.
      </p>
      <ul className="max-h-[min(60vh,28rem)] space-y-1 overflow-auto pr-1">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="flex items-center gap-2 rounded border border-border/70 bg-panel-2/50 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text">
                {row.label}
              </div>
              <div className="text-[11px] text-muted">
                {rowRoleLabel(row)}
                {row.hint ? ` · ${row.hint}` : ''}
              </div>
            </div>
            <input
              ref={index === 0 ? firstFieldRef : undefined}
              type="number"
              inputMode="numeric"
              className="field w-[4.5rem] text-center font-mono-stats tabular-nums"
              aria-label={`Initiative for ${row.label}`}
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
              className="btn btn-ghost btn-sm"
              onClick={() => rollRow(row.key, row.representative)}
            >
              Roll
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
