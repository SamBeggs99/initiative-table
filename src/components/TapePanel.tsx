import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  double,
  evaluateTape,
  half,
  tapeAmountForApply,
  type TapeHistoryEntry,
} from '../lib/tape';
import { selectActiveCombatants, useStore } from '../store';
import { VineRule } from './ornament/Botanical';

type ApplyMode = 'damage' | 'heal' | 'temp';

function currentNumber(input: string, result: number | null): number | null {
  if (result != null) return result;
  const ev = evaluateTape(input);
  return ev.ok ? ev.value : null;
}

export function TapePanel() {
  const combatants = useStore(selectActiveCombatants);
  const applyDamage = useStore((s) => s.applyDamage);
  const applyHealing = useStore((s) => s.applyHealing);
  const setTempHp = useStore((s) => s.setTempHp);

  const [input, setInput] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TapeHistoryEntry[]>([]);
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<ApplyMode>('damage');
  const inputRef = useRef<HTMLInputElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [history.length]);

  useEffect(() => {
    if (!targetId && combatants[0]) setTargetId(combatants[0].id);
    if (targetId && !combatants.some((c) => c.id === targetId)) {
      setTargetId(combatants[0]?.id ?? '');
    }
  }, [combatants, targetId]);

  const pushResult = (expression: string, value: number) => {
    setResult(value);
    setError(null);
    setHistory((h) =>
      [
        ...h,
        {
          id: crypto.randomUUID(),
          expression,
          value,
          at: Date.now(),
        },
      ].slice(-40),
    );
  };

  const runEval = (expr: string) => {
    const ev = evaluateTape(expr);
    if (!ev.ok) {
      setError(ev.error);
      return;
    }
    pushResult(expr, ev.value);
    setInput(String(ev.value));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runEval(input);
  };

  const reuse = (value: number) => {
    setInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || evaluateTape(trimmed).ok) return String(value);
      return `${trimmed}${value}`;
    });
    setResult(value);
    setError(null);
    inputRef.current?.focus();
  };

  const applyHalf = () => {
    const base = currentNumber(input, result);
    if (base == null) {
      setError('Evaluate a number first');
      return;
    }
    const v = half(base);
    pushResult(`HALF(${base})`, v);
    setInput(String(v));
  };

  const applyDouble = () => {
    const base = currentNumber(input, result);
    if (base == null) {
      setError('Evaluate a number first');
      return;
    }
    const v = double(base);
    pushResult(`DOUBLE(${base})`, v);
    setInput(String(v));
  };

  const applyToTarget = () => {
    const ev = result != null ? { ok: true as const, value: result } : evaluateTape(input);
    if (!ev.ok) {
      setError(ev.error);
      return;
    }
    if (!targetId) {
      setError('Select a combatant');
      return;
    }
    const amount = tapeAmountForApply(ev.value);
    if (amount === 0 && mode !== 'temp') {
      setError('Amount is 0');
      return;
    }
    if (mode === 'damage') applyDamage(targetId, amount);
    else if (mode === 'heal') applyHealing(targetId, amount);
    else setTempHp(targetId, amount);
  };

  return (
    <section className="flex shrink-0 flex-col border-b border-border p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="section-title section-title-leaf">Tape</h2>
        <span className="text-[10px] text-muted">No dice — you enter every number</span>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        Arithmetic pad for resistance halves and failed-save doubles. Nothing here is rolled
        by the app.
      </p>
      <VineRule className="my-2" />

      <div className="card mb-2 min-h-[4.5rem] max-h-28 flex-1 overflow-auto px-2 py-1.5 font-mono-stats text-xs tabular-nums">
        {history.length === 0 ? (
          <p className="text-muted">History appears here. Click a result to reuse it.</p>
        ) : (
          <ul className="space-y-0.5">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-panel-3"
                  onClick={() => reuse(h.value)}
                  title="Reuse as next operand"
                >
                  <span className="truncate text-muted">{h.expression}</span>
                  <span className="shrink-0 text-text">{h.value}</span>
                </button>
              </li>
            ))}
            <div ref={historyEndRef} />
          </ul>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-1">
        <input
          ref={inputRef}
          className="field min-w-0 flex-1 font-mono-stats text-sm tabular-nums"
          placeholder="14+3  or  17"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          aria-label="Tape expression"
        />
        <button type="submit" className="btn btn-accent px-3">
          =
        </button>
      </form>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button type="button" className="btn font-semibold" onClick={applyHalf}>
          HALF
        </button>
        <button type="button" className="btn font-semibold" onClick={applyDouble}>
          DOUBLE
        </button>
        {result != null && (
          <span className="ml-auto font-mono-stats text-base font-bold tabular-nums text-accent">
            {result}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-damage">{error}</p>}

      <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
        <div className="section-title">Apply to</div>
        <select
          className="field w-full text-xs"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={combatants.length === 0}
        >
          {combatants.length === 0 ? (
            <option value="">No combatants</option>
          ) : (
            combatants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.hp}/{c.maxHp})
              </option>
            ))
          )}
        </select>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['damage', 'Damage', 'btn-danger'],
              ['heal', 'Heal', 'border-heal! text-heal'],
              ['temp', 'Temp HP', 'btn-accent'],
            ] as const
          ).map(([m, label, cls]) => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm ${mode === m ? cls : 'text-muted'}`}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={!targetId || (result == null && !input.trim())}
            className="btn btn-sm btn-primary ml-auto"
            onClick={applyToTarget}
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}
