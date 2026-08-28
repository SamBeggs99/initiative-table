import type { Entry, StatBlock } from '../../types';
import { enrichEntry } from '../parse';
import { nethysActionCost } from '../spells/normalize-nethys';
import { deterministicCreatureId, slugifyName } from './ids';

/** Remaster monster books only — not adventure NPCs or legacy Bestiaries. */
export const NETHYS_CREATURE_SOURCES = ['Monster Core', 'Monster Core 2'] as const;

const CORE_SOURCE_SET = new Set<string>(NETHYS_CREATURE_SOURCES);

const PF2E_TYPE_TRAITS = new Set([
  'aberration',
  'animal',
  'astral',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'dream',
  'elemental',
  'ethereal',
  'fey',
  'fiend',
  'fungus',
  'giant',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'shade',
  'spirit',
  'time',
  'undead',
]);

const SKIP_HEADERS = new Set([
  'source',
  'perception',
  'languages',
  'skills',
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
  'ac',
  'fort',
  'ref',
  'will',
  'hp',
  'immunities',
  'immunity',
  'resistances',
  'resistance',
  'weaknesses',
  'weakness',
  'speed',
  'items',
  'unspecific lore',
  'specific lore',
]);

const INLINE_HEADERS = new Set([
  'trigger',
  'effect',
  'damage',
  'requirements',
  'requirement',
  'frequency',
  'success',
  'failure',
  'critical success',
  'critical failure',
  'area',
  'range',
  'saving throw',
  'hit',
]);

export interface NethysCreature {
  name?: string;
  level?: number;
  ac?: number;
  hp?: number;
  hp_raw?: string;
  size?: string | string[];
  trait?: string[];
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  perception?: number;
  fortitude_save?: number;
  reflex_save?: number;
  will_save?: number;
  speed?: Record<string, number | string>;
  speed_raw?: string;
  skill?: string[];
  skill_mod?: Record<string, number>;
  immunity?: string[];
  resistance?: Record<string, number> | string[];
  weakness?: Record<string, number> | string[];
  resistance_raw?: string;
  markdown?: string;
  primary_source?: string;
  primary_source_raw?: string;
  exclude_from_search?: boolean;
  npc?: boolean;
  url?: string;
  id?: string;
  language_markdown?: string;
  sense_markdown?: string;
  sense?: string[];
  creature_family?: string;
}

export function isNethysCreatureSource(source: string | undefined): boolean {
  return CORE_SOURCE_SET.has((source ?? '').trim());
}

/** PF2e stores ability modifiers; StatBlock abilities are 3–30 scores. */
export function pf2eModToScore(mod: number | undefined): number {
  if (typeof mod !== 'number' || Number.isNaN(mod)) return 10;
  return 10 + 2 * mod;
}

export function cleanAonFragment(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

function firstLineValue(text: string, header: string): string {
  const re = new RegExp(
    `\\*\\*${header}\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*|$)`,
    'i',
  );
  const m = text.match(re);
  return m ? cleanAonFragment(m[1] ?? '') : '';
}

function listOrRecord(
  value: string[] | Record<string, number> | undefined,
): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return Object.entries(value)
    .filter(([, n]) => typeof n === 'number')
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
}

function creatureSize(raw: NethysCreature): string {
  if (Array.isArray(raw.size) && raw.size[0]) return raw.size[0];
  if (typeof raw.size === 'string' && raw.size.trim()) return raw.size.trim();
  const sizeTrait = (raw.trait ?? []).find((t) =>
    /^(Tiny|Small|Medium|Large|Huge|Gargantuan)$/i.test(t),
  );
  return sizeTrait ?? '';
}

function creatureType(raw: NethysCreature): string {
  const family = (raw.creature_family ?? '').trim();
  if (family) return family;
  const typed = (raw.trait ?? []).find((t) =>
    PF2E_TYPE_TRAITS.has(t.trim().toLowerCase()),
  );
  return typed ?? (raw.trait ?? []).filter((t) => !/^(Tiny|Small|Medium|Large|Huge|Gargantuan)$/i.test(t))[0] ?? '';
}

function mapSpeed(raw: NethysCreature): Record<string, number | string> {
  const s = raw.speed;
  if (s && typeof s === 'object') {
    const out: Record<string, number | string> = {};
    if (typeof s.land === 'number') out.walk = s.land;
    if (typeof s.fly === 'number') out.fly = s.fly;
    if (typeof s.swim === 'number') out.swim = s.swim;
    if (typeof s.climb === 'number') out.climb = s.climb;
    if (typeof s.burrow === 'number') out.burrow = s.burrow;
    if (Object.keys(out).length > 0) return out;
  }
  if (raw.speed_raw?.trim()) return { walk: raw.speed_raw.trim() };
  return { walk: 25 };
}

function mapSkills(raw: NethysCreature): Record<string, number> {
  const mods = raw.skill_mod ?? {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(mods)) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

function titleCaseName(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function parseActionMarker(text: string): {
  cost?: ReturnType<typeof nethysActionCost>;
  rest: string;
} {
  const m = text.match(/⟦([^⟧]+)⟧/);
  if (!m) return { rest: text.trim() };
  return {
    cost: nethysActionCost(m[1]),
    rest: text.replace(/⟦[^⟧]+⟧/g, ' ').replace(/\s+/g, ' ').trim(),
  };
}

function parseStrike(
  kind: 'Melee' | 'Ranged',
  body: string,
): { name: string; desc: string; cost?: ReturnType<typeof nethysActionCost> } {
  const marked = parseActionMarker(body);
  const rest = marked.rest.replace(/\*\*/g, '');
  const m = rest.match(
    /^(.+?)\s+([+-]\d+)\s*(?:\(([^)]*)\))?\s*,?\s*(?:Damage\s+(.+))?$/i,
  );
  if (!m) {
    return {
      name: kind,
      desc: `${kind}${marked.rest ? ` ${marked.rest}` : ''}`.trim(),
      cost: marked.cost,
    };
  }
  const weapon = titleCaseName(m[1]!.trim());
  const traits = m[3]?.trim();
  const damage = m[4]?.trim();
  const parts = [
    `${kind} ${m[2]}`,
    traits ? `(${traits})` : '',
    damage ? `Damage ${damage}` : '',
  ].filter(Boolean);
  return { name: weapon, desc: parts.join(' ').replace(/\s+/g, ' ').trim(), cost: marked.cost };
}

interface ParsedCreatureMd {
  traits: Entry[];
  actions: Entry[];
  reactions: Entry[];
  actionCosts: NonNullable<StatBlock['pf2e']>['actionCosts'];
  languages: string;
  senses: string;
}

function splitBoldSections(text: string): { name: string; body: string }[] {
  const re = /\*\*([^*]+)\*\*/g;
  const matches = [...text.matchAll(re)];
  const out: { name: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const name = cleanAonFragment(m[1] ?? '');
    if (!name || INLINE_HEADERS.has(name.toLowerCase())) continue;
    const bodyStart = (m.index ?? 0) + m[0].length;
    let bodyEnd = text.length;
    for (let j = i + 1; j < matches.length; j++) {
      const nextName = cleanAonFragment(matches[j]![1] ?? '');
      if (nextName && !INLINE_HEADERS.has(nextName.toLowerCase())) {
        bodyEnd = matches[j]!.index ?? text.length;
        break;
      }
    }
    out.push({ name, body: text.slice(bodyStart, bodyEnd).trim() });
  }
  return out;
}

export function parseAonCreatureMarkdown(
  markdown: string | undefined,
): ParsedCreatureMd {
  const raw = markdown ?? '';
  const prepared = raw
    .replace(/<actions\s+string="([^"]*)"\s*\/>/gi, ' ⟦$1⟧ ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const languages = firstLineValue(prepared, 'Languages');
  const perceptionLine = firstLineValue(prepared, 'Perception');
  const senses = perceptionLine.includes(';')
    ? perceptionLine.slice(perceptionLine.indexOf(';') + 1).trim()
    : '';

  const traits: Entry[] = [];
  const actions: Entry[] = [];
  const reactions: Entry[] = [];
  const actionCosts: NonNullable<StatBlock['pf2e']>['actionCosts'] = {};

  for (const section of splitBoldSections(prepared)) {
    const key = section.name.toLowerCase();
    if (SKIP_HEADERS.has(key)) continue;
    if (key.startsWith('recall knowledge')) continue;

    const kind =
      /^melee$/i.test(section.name)
        ? 'Melee'
        : /^ranged$/i.test(section.name)
          ? 'Ranged'
          : null;
    const parsed = kind
      ? parseStrike(kind, section.body)
      : (() => {
          const marked = parseActionMarker(section.body);
          return {
            name: section.name,
            desc: marked.rest,
            cost: marked.cost,
          };
        })();

    const desc = parsed.desc.replace(/\s+/g, ' ').trim();
    if (!parsed.name) continue;
    const entry = enrichEntry({ name: parsed.name, desc });
    if (parsed.cost) actionCosts[parsed.name] = parsed.cost;

    if (parsed.cost === 'reaction') reactions.push(entry);
    else if (kind || parsed.cost === 1 || parsed.cost === 2 || parsed.cost === 3 || parsed.cost === 'free') {
      actions.push(entry);
    } else if (desc) {
      traits.push(entry);
    }
  }

  return { traits, actions, reactions, actionCosts, languages, senses };
}

/**
 * Map one Archives of Nethys Elasticsearch `_source` onto StatBlock.
 * Returns null when the hit is not Monster Core / Monster Core 2, is hidden
 * from search, or has no name.
 */
export function nethysToStatBlock(
  raw: NethysCreature,
  origin: 'synced' | 'bundled' = 'synced',
): StatBlock | null {
  const name = (raw.name ?? '').trim();
  if (!name) return null;
  if (raw.exclude_from_search) return null;
  if (!isNethysCreatureSource(raw.primary_source)) return null;

  const slug = slugifyName(name);
  const parsed = parseAonCreatureMarkdown(raw.markdown);
  const traits = (raw.trait ?? []).map((t) => t.trim()).filter(Boolean);
  const level = typeof raw.level === 'number' ? raw.level : 0;
  const now = 0;
  const languages =
    parsed.languages || cleanAonFragment(raw.language_markdown ?? '');
  const senses = parsed.senses || cleanAonFragment(raw.sense_markdown ?? '');
  const resistances =
    cleanAonFragment(raw.resistance_raw ?? '') || listOrRecord(raw.resistance);
  const immunities = listOrRecord(raw.immunity);
  const vulnerabilities = listOrRecord(raw.weakness);
  const perception = typeof raw.perception === 'number' ? raw.perception : 0;
  const fortitude = typeof raw.fortitude_save === 'number' ? raw.fortitude_save : 0;
  const reflex = typeof raw.reflex_save === 'number' ? raw.reflex_save : 0;
  const will = typeof raw.will_save === 'number' ? raw.will_save : 0;

  return {
    id: deterministicCreatureId('pf2e', 'nethys', slug),
    system: 'pf2e',
    origin,
    slug,
    name,
    size: creatureSize(raw),
    type: creatureType(raw),
    alignment: '',
    ac: typeof raw.ac === 'number' ? raw.ac : 10,
    hpAvg: typeof raw.hp === 'number' ? raw.hp : 1,
    hitDice: (raw.hp_raw ?? String(raw.hp ?? '')).trim(),
    speed: mapSpeed(raw),
    abilities: {
      str: pf2eModToScore(raw.strength),
      dex: pf2eModToScore(raw.dexterity),
      con: pf2eModToScore(raw.constitution),
      int: pf2eModToScore(raw.intelligence),
      wis: pf2eModToScore(raw.wisdom),
      cha: pf2eModToScore(raw.charisma),
    },
    saves: {
      con: fortitude,
      dex: reflex,
      wis: will,
    },
    skills: mapSkills(raw),
    vulnerabilities: vulnerabilities || undefined,
    resistances: resistances || undefined,
    immunities: immunities || undefined,
    senses,
    languages,
    cr: String(level),
    traits: parsed.traits,
    actions: parsed.actions,
    bonusActions: [],
    reactions: parsed.reactions,
    legendaryActions: [],
    source: (raw.primary_source_raw ?? raw.primary_source ?? 'Monster Core').trim(),
    pf2e: {
      level,
      perception,
      fortitude,
      reflex,
      will,
      traits: traits.map((t) => t.toLowerCase()),
      actionCosts: parsed.actionCosts,
    },
    retired: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Disambiguate when two core creatures share a slug. */
export function uniquifyNethysCreatureId(
  creature: StatBlock,
  aonId: string,
  taken: Set<string>,
): StatBlock {
  if (!taken.has(creature.id)) return creature;
  const suffix = aonId.replace(/^creature-/i, '') || slugifyName(aonId);
  const slug = `${creature.slug}-${suffix}`;
  return {
    ...creature,
    id: deterministicCreatureId('pf2e', 'nethys', slug),
    slug,
  };
}
