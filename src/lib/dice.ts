export type AdvantageMode = 'flat' | 'adv' | 'dis';

export interface RollResult {
  total: number;
  rolls: number[];
  detail: string;
}

/** One `NdS` term or one flat number, with its sign. */
interface DiceTerm {
  sign: 1 | -1;
  count: number;
  sides: number;
}

interface ParsedExpr {
  terms: DiceTerm[];
  /** Sum of all the flat modifiers. */
  mod: number;
}

const TERM_RE = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;

function cleanExpr(expr: string): string {
  return expr.replace(/\s+/g, '').replace(/[−–—]/g, '-');
}

/**
 * Parse a sum of dice and flat terms: `2d6`, `2d6+3`, `1d8+1d6+4`, `10-1d4`.
 *
 * Previously this accepted exactly one dice term and one modifier, so a smite,
 * a sneak attack, or any "plus 1d6" the DM typed by hand threw. Monster stat
 * blocks avoided the limit by carrying separate typed clauses; a human at the
 * damage field had no such escape.
 */
function parseDiceExpr(expr: string): ParsedExpr {
  const cleaned = cleanExpr(expr);
  if (!cleaned) throw new Error(`Invalid dice expression: ${expr}`);

  const terms: DiceTerm[] = [];
  let mod = 0;
  let consumed = 0;
  let totalDice = 0;

  TERM_RE.lastIndex = 0;
  for (let m = TERM_RE.exec(cleaned); m; m = TERM_RE.exec(cleaned)) {
    if (m.index !== consumed) break; // a gap means unparseable junk
    consumed = m.index + m[0].length;

    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (m[4] !== undefined) {
      mod += sign * Number(m[4]);
      continue;
    }

    const count = m[2] === '' || m[2] === undefined ? 1 : Number(m[2]);
    const sides = Number(m[3]);
    if (
      !Number.isFinite(count) ||
      !Number.isFinite(sides) ||
      sides < 1 ||
      count < 1
    ) {
      throw new Error(`Invalid dice expression: ${expr}`);
    }
    totalDice += count;
    if (totalDice > 200) throw new Error('Cannot roll more than 200 dice');
    terms.push({ sign, count, sides });
  }

  if (consumed !== cleaned.length) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }
  if (terms.length === 0 && !/\d/.test(cleaned)) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }
  return { terms, mod };
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function formatMod(mod: number): string {
  if (mod === 0) return '';
  return mod > 0 ? `+${mod}` : `${mod}`;
}

function describeTerms(terms: DiceTerm[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign < 0 ? '-' : i === 0 ? '' : '+';
      return `${sign}${t.count}d${t.sides}`;
    })
    .join('');
}

/**
 * Roll an expression. `opts.critDoubleDice` doubles every dice term's count and
 * leaves flat modifiers alone, which is how 5e crits work — the modifier is not
 * doubled.
 */
export function rollExpression(
  expr: string,
  opts?: { critDoubleDice?: boolean },
): RollResult {
  const parsed = parseDiceExpr(expr);
  const terms = opts?.critDoubleDice
    ? parsed.terms.map((t) => ({ ...t, count: t.count * 2 }))
    : parsed.terms;

  const rolls: number[] = [];
  let sum = 0;
  const parts: string[] = [];

  for (const term of terms) {
    const faces: number[] = [];
    for (let i = 0; i < term.count; i++) faces.push(rollDie(term.sides));
    rolls.push(...faces);
    sum += term.sign * faces.reduce((a, b) => a + b, 0);
    parts.push(
      `${term.sign < 0 ? '-' : parts.length === 0 ? '' : '+'}${term.count}d${
        term.sides
      }[${faces.join(', ')}]`,
    );
  }

  const total = sum + parsed.mod;
  const modStr = formatMod(parsed.mod);
  const left = describeTerms(terms) + modStr;
  const detail =
    terms.length === 0
      ? `${total}`
      : `${left} → ${parts.join('')}${modStr}=${total}`;

  return { total, rolls, detail };
}

export function rollWithAdvantage(mod: number, mode: AdvantageMode): RollResult {
  if (mode === 'flat') {
    const roll = rollDie(20);
    return {
      total: roll + mod,
      rolls: [roll],
      detail: `d20${formatMod(mod)} → ${roll}${formatMod(mod)}=${roll + mod}`,
    };
  }
  const a = rollDie(20);
  const b = rollDie(20);
  const picked = mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
  const total = picked + mod;
  const label = mode === 'adv' ? 'adv' : 'dis';
  return {
    total,
    rolls: [a, b],
    detail: `d20 ${label} [${a}, ${b}]→${picked}${formatMod(mod)}=${total}`,
  };
}

/** Average of a dice expression (e.g. hit dice). May be fractional (d8 average 4.5). */
export function averageOf(expr: string): number {
  const { terms, mod } = parseDiceExpr(expr);
  return (
    terms.reduce(
      (sum, t) => sum + t.sign * ((t.count * (t.sides + 1)) / 2),
      0,
    ) + mod
  );
}

/** Highest possible result — used to sanity-check a hand-typed expression. */
export function maxOf(expr: string): number {
  const { terms, mod } = parseDiceExpr(expr);
  return terms.reduce((sum, t) => sum + t.sign * t.count * t.sides, 0) + mod;
}

/**
 * Roll (or take) structured action damage. Accepts `2d6+3` or a flat `8`.
 */
export function resolveDamageExpr(
  expr: string,
  opts?: { critDoubleDice?: boolean },
): RollResult {
  const cleaned = cleanExpr(expr);
  if (!cleaned) {
    throw new Error('Empty damage expression');
  }
  if (/^\d+$/.test(cleaned)) {
    const total = Number(cleaned);
    // A flat number is a flat number; a crit does not double a fixed value.
    return { total, rolls: [total], detail: `${total}` };
  }
  return rollExpression(cleaned, opts);
}
