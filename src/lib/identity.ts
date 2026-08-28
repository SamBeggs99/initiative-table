import type { Combatant } from '../types';

/**
 * Identity colour: a per-character hue so a DM can find "the wizard" or "the
 * ogres" without reading. It is an *identity* cue only — health, allegiance,
 * and conditions keep their own semantics elsewhere and never live here.
 *
 * Two rules make the colours trustworthy:
 *  - A PC's hue is a pure function of their class, so it never moves.
 *  - Enemy groups are assigned around the PCs, so no two groups in one fight
 *    share a hue while any are left.
 */
export interface IdentityHue {
  id: string;
  hex: string;
}

/**
 * Eleven chromatic steps around the wheel plus three neutrals, all muted to
 * sit inside the earthy palette. Every hex is dark enough to clear 4.5:1 on
 * the parchment surfaces, because these are used as text colours.
 */
export const IDENTITY_HUES: readonly IdentityHue[] = [
  { id: 'rust', hex: '#a34426' },
  { id: 'amber', hex: '#8f6410' },
  { id: 'olive', hex: '#63620f' },
  { id: 'moss', hex: '#45701f' },
  { id: 'forest', hex: '#2c6b3f' },
  { id: 'teal', hex: '#16695f' },
  { id: 'sky', hex: '#256a8e' },
  { id: 'indigo', hex: '#3a54a2' },
  { id: 'violet', hex: '#6b3ba0' },
  { id: 'mulberry', hex: '#93327c' },
  { id: 'rose', hex: '#a8324f' },
  { id: 'slate', hex: '#4c5b6b' },
  { id: 'umber', hex: '#6d4a2b' },
  // Desaturated rather than dark, so it never reads as plain body text.
  { id: 'charcoal', hex: '#574a63' },
];

const HUE_BY_ID = new Map(IDENTITY_HUES.map((h) => [h.id, h]));

/**
 * Curated class hues. The thirteen 5e classes each get a distinct step so a
 * real party never collides; PF2e classes reuse their closest analogue, which
 * is safe because a campaign is a single system.
 */
const CLASS_HUE: Record<string, string> = {
  artificer: 'umber',
  barbarian: 'rust',
  bard: 'mulberry',
  cleric: 'amber',
  druid: 'moss',
  fighter: 'slate',
  monk: 'teal',
  paladin: 'olive',
  ranger: 'forest',
  rogue: 'charcoal',
  sorcerer: 'rose',
  warlock: 'violet',
  wizard: 'indigo',
  // PF2e
  alchemist: 'sky',
  champion: 'olive',
  investigator: 'umber',
  oracle: 'amber',
  swashbuckler: 'rust',
  witch: 'violet',
  magus: 'indigo',
  summoner: 'mulberry',
  gunslinger: 'slate',
  thaumaturge: 'charcoal',
  psychic: 'violet',
  kineticist: 'teal',
  inventor: 'umber',
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** FNV-1a — small, stable, and dependency-free. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashHueId(seed: string): string {
  return IDENTITY_HUES[hash(seed) % IDENTITY_HUES.length]!.id;
}

/**
 * First recognised class word wins, so multiclass labels like
 * "Paladin 3 / Warlock 2" colour by the character's lead class.
 */
function curatedClassHue(charClass: string): string | null {
  const words = normalize(charClass).split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    const hue = CLASS_HUE[word];
    if (hue) return hue;
  }
  return null;
}

/**
 * A PC's hue. Stable across sessions and identical everywhere the character
 * appears, so the roster and the initiative list always agree.
 */
export function pcHueId(charClass: string, fallbackSeed: string): string {
  const curated = curatedClassHue(charClass);
  if (curated) return curated;
  const trimmed = charClass.trim();
  if (trimmed) return hashHueId(normalize(trimmed));
  return hashHueId(normalize(fallbackSeed));
}

/** Strips the "A"/"B"/"2" copy suffix so Goblin A and Goblin B group together. */
function baseCreatureName(name: string): string {
  return normalize(name).replace(/\s+(?:[a-z]|\d{1,2})$/, '');
}

/**
 * What makes two combatants "the same thing" for colouring. Prefers the stat
 * block slug so goblins added in separate batches still share a hue.
 */
export function enemyGroupKey(c: Combatant): string {
  return (
    c.statBlock?.slug ||
    c.statBlock?.id ||
    c.sourceNpcId ||
    c.groupKey ||
    baseCreatureName(c.name)
  );
}

/** Steps between two hues around the wheel, in either direction. */
function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, IDENTITY_HUES.length - raw);
}

function minDistanceToTaken(index: number, taken: Set<number>): number {
  let min = IDENTITY_HUES.length;
  for (const t of taken) min = Math.min(min, hueDistance(index, t));
  return min;
}

/**
 * Neighbouring steps are perceptually close (two greens read as one colour at a
 * glance), so a seed is only kept when it is at least this far from every hue
 * already in play.
 */
const MIN_SEPARATION = 2;

/**
 * Assigns a hue to every combatant. PCs take their class hue outright, so a
 * character's colour never moves. Enemy groups prefer their own seed and step
 * away only when it would crowd a hue already on the table — picking whichever
 * free hue sits furthest from the ones in use.
 */
export function assignIdentityHues(combatants: Combatant[]): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<number>();
  const indexOf = new Map(IDENTITY_HUES.map((h, i) => [h.id, i]));

  for (const c of combatants) {
    if (c.kind !== 'pc') continue;
    const hue = pcHueId(c.charClass ?? '', c.name);
    result.set(c.id, hue);
    taken.add(indexOf.get(hue)!);
  }

  const groups = new Map<string, Combatant[]>();
  for (const c of combatants) {
    if (c.kind === 'pc' || c.kind === 'lair') continue;
    const key = enemyGroupKey(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  // Sorted so the assignment is deterministic regardless of initiative order.
  for (const key of [...groups.keys()].sort()) {
    const seed = hash(key) % IDENTITY_HUES.length;
    let chosen = seed;

    if (taken.size > 0 && minDistanceToTaken(seed, taken) < MIN_SEPARATION) {
      let best = -1;
      for (let step = 0; step < IDENTITY_HUES.length; step++) {
        const candidate = (seed + step) % IDENTITY_HUES.length;
        if (taken.has(candidate)) continue;
        const distance = minDistanceToTaken(candidate, taken);
        // Walking forward from the seed means ties resolve to the nearest
        // available hue, so a group drifts as little as possible.
        if (distance > best) {
          best = distance;
          chosen = candidate;
        }
      }
      // Every hue is spoken for — reuse the seed rather than leaving it blank.
      if (best < 0) chosen = seed;
    }

    taken.add(chosen);
    const hue = IDENTITY_HUES[chosen]!.id;
    for (const c of groups.get(key)!) result.set(c.id, hue);
  }

  return result;
}

/** Stable hue for a named NPC — identity only, not allegiance. */
export function npcHueId(seed: string): string {
  return hashHueId(normalize(seed) || 'npc');
}

export function hueHex(hueId: string | undefined): string | undefined {
  return hueId ? HUE_BY_ID.get(hueId)?.hex : undefined;
}
