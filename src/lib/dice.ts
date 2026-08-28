export type AdvantageMode = 'flat' | 'adv' | 'dis';

export interface RollResult {
  total: number;
  rolls: number[];
  detail: string;
}

const DICE_RE = /^(\d*)d(\d+)([+-]\d+)?$/i;

function parseDiceExpr(expr: string): { count: number; sides: number; mod: number } {
  const cleaned = expr.replace(/\s+/g, '').replace(/[−–—]/g, '-');
  const m = DICE_RE.exec(cleaned);
  if (!m) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }
  const count = m[1] === '' || m[1] === undefined ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  const mod = m[3] ? Number(m[3]) : 0;
  if (!Number.isFinite(count) || !Number.isFinite(sides) || sides < 1 || count < 1) {
    throw new Error(`Invalid dice expression: ${expr}`);
  }
  if (count > 200) {
    throw new Error('Cannot roll more than 200 dice');
  }
  return { count, sides, mod };
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollExpression(expr: string): RollResult {
  const { count, sides, mod } = parseDiceExpr(expr);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + mod;
  const modStr = mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`;
  const detail = `${count}d${sides}${modStr} → [${rolls.join(', ')}]${modStr}=${total}`;
  return { total, rolls, detail };
}

export function rollWithAdvantage(mod: number, mode: AdvantageMode): RollResult {
  if (mode === 'flat') {
    const roll = rollDie(20);
    return {
      total: roll + mod,
      rolls: [roll],
      detail: `d20${mod >= 0 ? `+${mod}` : mod} → ${roll}${mod >= 0 ? `+${mod}` : mod}=${roll + mod}`,
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
    detail: `d20 ${label} [${a}, ${b}]→${picked}${mod >= 0 ? `+${mod}` : mod}=${total}`,
  };
}

/** Average of a dice expression (e.g. hit dice). May be fractional (d8 average 4.5). */
export function averageOf(expr: string): number {
  const { count, sides, mod } = parseDiceExpr(expr);
  return (count * (sides + 1)) / 2 + mod;
}

/**
 * Roll (or take) structured action damage. Accepts `2d6+3` or a flat `8`.
 */
export function resolveDamageExpr(expr: string): RollResult {
  const cleaned = expr.replace(/\s+/g, '').replace(/[−–—]/g, '-');
  if (!cleaned) {
    throw new Error('Empty damage expression');
  }
  if (/^\d+$/.test(cleaned)) {
    const total = Number(cleaned);
    return { total, rolls: [total], detail: `${total}` };
  }
  return rollExpression(cleaned);
}
