import { useCallback, useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const GLOW_MS = 850;
const TUMBLE_FALLBACK_MS = 1100;

export type DieRollPhase = 'idle' | 'rolling' | 'glowing';

interface DieRollState {
  phase: DieRollPhase;
  value: number;
  spin: number;
}

/**
 * Drives per-row physical die rolls: tumble, land, glow, then settle.
 * Keyed so "Roll all" can animate many dice at once.
 */
export function useRollAnimation() {
  const [rolls, setRolls] = useState<Record<string, DieRollState>>({});
  const pending = useRef<
    Record<string, { value: number; onDone?: (result: number) => void }>
  >({});
  const glowTimers = useRef<Record<string, number>>({});
  const delayTimers = useRef<Record<string, number>>({});
  const tumbleTimers = useRef<Record<string, number>>({});

  const clear = useCallback((key: string) => {
    if (glowTimers.current[key] != null) {
      window.clearTimeout(glowTimers.current[key]);
      delete glowTimers.current[key];
    }
    if (delayTimers.current[key] != null) {
      window.clearTimeout(delayTimers.current[key]);
      delete delayTimers.current[key];
    }
    if (tumbleTimers.current[key] != null) {
      window.clearTimeout(tumbleTimers.current[key]);
      delete tumbleTimers.current[key];
    }
    delete pending.current[key];
  }, []);

  useEffect(
    () => () => {
      for (const id of Object.values(glowTimers.current)) window.clearTimeout(id);
      for (const id of Object.values(delayTimers.current)) window.clearTimeout(id);
      for (const id of Object.values(tumbleTimers.current)) window.clearTimeout(id);
    },
    [],
  );

  const land = useCallback((key: string) => {
    const queued = pending.current[key];
    if (!queued) return;
    const { value, onDone } = queued;
    delete pending.current[key];
    if (tumbleTimers.current[key] != null) {
      window.clearTimeout(tumbleTimers.current[key]);
      delete tumbleTimers.current[key];
    }
    setRolls((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { spin: 1, value }), phase: 'glowing', value },
    }));
    onDone?.(value);
    glowTimers.current[key] = window.setTimeout(() => {
      setRolls((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? { spin: 1, value }), phase: 'idle', value },
      }));
      delete glowTimers.current[key];
    }, GLOW_MS);
  }, []);

  const roll = useCallback(
    (key: string, result: number, opts?: { delay?: number; onDone?: (result: number) => void }) => {
      clear(key);
      const spin = 1 + Math.floor(Math.random() * 6);
      pending.current[key] = { value: result, onDone: opts?.onDone };

      const start = () => {
        if (prefersReducedMotion()) {
          land(key);
          return;
        }
        setRolls((prev) => ({
          ...prev,
          [key]: { phase: 'rolling', value: result, spin },
        }));
        tumbleTimers.current[key] = window.setTimeout(() => land(key), TUMBLE_FALLBACK_MS);
      };

      if (opts?.delay && opts.delay > 0) {
        delayTimers.current[key] = window.setTimeout(start, opts.delay);
      } else {
        start();
      }
    },
    [clear, land],
  );

  return {
    roll,
    finishTumble: land,
    phaseOf: (key: string): DieRollPhase => rolls[key]?.phase ?? 'idle',
    valueFor: (key: string) => rolls[key]?.value,
    spinFor: (key: string) => rolls[key]?.spin ?? 1,
    isBusy: (key: string) => {
      const phase = rolls[key]?.phase;
      return phase === 'rolling' || phase === 'glowing';
    },
  };
}
