/**
 * DM tape — plain arithmetic only. Never rolls dice.
 * Every number comes from what the DM typed or reused from history.
 */

export type TapeEval =
  | { ok: true; value: number }
  | { ok: false; error: string };

export interface TapeHistoryEntry {
  id: string;
  expression: string;
  value: number;
  at: number;
}

/** Floor-half — resistance / failed-save halves. */
export function half(n: number): number {
  return Math.floor(n / 2);
}

export function double(n: number): number {
  return n * 2;
}

/**
 * Evaluate a simple arithmetic expression: + - * / ( ) and decimals.
 * Rejects dice notation and identifiers so this never looks like a roller.
 */
export function evaluateTape(raw: string): TapeEval {
  const src = raw.trim().replace(/\s+/g, '');
  if (!src) return { ok: false, error: 'Enter an expression' };
  if (/[dD]\d/.test(src)) {
    return { ok: false, error: 'No dice here — type the number you already rolled' };
  }
  if (/[^0-9+\-*/().]/.test(src)) {
    return { ok: false, error: 'Only + − × ÷ and parentheses' };
  }

  let i = 0;

  const peek = () => src[i];
  const eat = () => src[i++];

  function parseExpression(): number {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = eat();
      const r = parseFactor();
      if (op === '*') v *= r;
      else {
        if (r === 0) throw new Error('Division by zero');
        v /= r;
      }
    }
    return v;
  }

  function parseFactor(): number {
    if (peek() === '+') {
      eat();
      return parseFactor();
    }
    if (peek() === '-') {
      eat();
      return -parseFactor();
    }
    if (peek() === '(') {
      eat();
      const v = parseExpression();
      if (peek() !== ')') throw new Error('Missing )');
      eat();
      return v;
    }
    return parseNumber();
  }

  function parseNumber(): number {
    const start = i;
    while (peek() && /[0-9.]/.test(peek()!)) eat();
    if (start === i) throw new Error('Expected a number');
    const n = Number(src.slice(start, i));
    if (!Number.isFinite(n)) throw new Error('Invalid number');
    return n;
  }

  try {
    const value = parseExpression();
    if (i !== src.length) throw new Error('Unexpected characters');
    if (!Number.isFinite(value)) throw new Error('Invalid result');
    // Prefer integers when extremely close (floating point from /)
    const rounded =
      Math.abs(value - Math.round(value)) < 1e-10 ? Math.round(value) : value;
    return { ok: true, value: rounded };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not evaluate',
    };
  }
}

/** Whole-number amount for applying to HP (DMs deal in integers). */
export function tapeAmountForApply(value: number): number {
  return Math.max(0, Math.floor(Math.abs(value)));
}
