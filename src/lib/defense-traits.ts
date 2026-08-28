/**
 * Damage/condition traits on a stat block are stored as a single 5e-style
 * string (`fire, lightning; bludgeoning, piercing, and slashing from
 * nonmagical attacks`). Split that into chips for the monster entry without
 * changing how combat still matches with `.includes(type)`.
 */

export interface DefenseToken {
  name: string;
  qualifier?: string;
}

export interface DefenseGroup {
  tokens: DefenseToken[];
  qualifier?: string;
}

const QUALIFIER_RE = /\s+(from|that aren't|that aren’t)\s+/i;

function splitTypes(list: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  const flush = () => {
    const t = buf.trim().replace(/^and\s+/i, '').trim();
    if (t) parts.push(t);
    buf = '';
  };
  for (const ch of list) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return parts;
}

export function parseDefenseTraits(raw: string | undefined): DefenseGroup[] {
  if (!raw?.trim()) return [];
  const groups: DefenseGroup[] = [];
  for (const segment of raw.split(';')) {
    const text = segment.trim();
    if (!text) continue;
    const match = text.match(QUALIFIER_RE);
    if (match && match.index != null && match.index > 0) {
      const types = text.slice(0, match.index).trim();
      const qualifier = text.slice(match.index).trim().replace(/\s+/g, ' ');
      const tokens = splitTypes(types).map((name) => ({ name }));
      if (tokens.length > 0) {
        groups.push({ tokens, qualifier });
        continue;
      }
    }
    const tokens = splitTypes(text).map((name) => ({ name }));
    if (tokens.length > 0) groups.push({ tokens });
  }
  return groups;
}

export function formatDefenseTokenLabel(name: string): string {
  return name.replace(/^\p{L}/u, (c) => c.toUpperCase());
}
