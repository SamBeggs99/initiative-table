import type { Ability, Entry, StatBlock } from '../../types';
import { enrichEntry } from '../parse';
import { deterministicCreatureId, slugifyName } from './ids';

/** Minimal Open5e monster shape we care about. */
export interface Open5eMonster {
  slug?: string;
  name: string;
  size?: string;
  type?: string;
  subtype?: string;
  alignment?: string;
  armor_class?: number;
  armor_desc?: string | null;
  hit_points?: number;
  hit_dice?: string;
  speed?: Record<string, number | string>;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  strength_save?: number | null;
  dexterity_save?: number | null;
  constitution_save?: number | null;
  intelligence_save?: number | null;
  wisdom_save?: number | null;
  charisma_save?: number | null;
  skills?: Record<string, number>;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  challenge_rating?: string | number;
  cr?: number | string;
  actions?: { name: string; desc?: string }[];
  bonus_actions?: { name: string; desc?: string }[];
  reactions?: { name: string; desc?: string }[];
  legendary_desc?: string;
  legendary_actions?: { name: string; desc?: string }[];
  special_abilities?: { name: string; desc?: string }[];
  document__slug?: string;
  document__title?: string;
}

function entries(arr?: { name: string; desc?: string }[]): Entry[] {
  return (arr ?? []).map((a) =>
    enrichEntry({ name: a.name, desc: a.desc ?? '' }),
  );
}

function saves(m: Open5eMonster): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  const pairs: [keyof Open5eMonster, Ability][] = [
    ['strength_save', 'str'],
    ['dexterity_save', 'dex'],
    ['constitution_save', 'con'],
    ['intelligence_save', 'int'],
    ['wisdom_save', 'wis'],
    ['charisma_save', 'cha'],
  ];
  for (const [key, ab] of pairs) {
    const v = m[key];
    if (typeof v === 'number') out[ab] = v;
  }
  return out;
}

export function open5eToStatBlock(
  m: Open5eMonster,
  origin: 'synced' | 'bundled' = 'synced',
): StatBlock {
  const sourceSlug = m.document__slug || 'wotc-srd';
  const slug = m.slug || slugifyName(m.name);
  const type = [m.type, m.subtype].filter(Boolean).join(' ').trim();

  return {
    id: deterministicCreatureId('dnd5e', sourceSlug, slug),
    system: 'dnd5e',
    origin,
    slug,
    name: m.name,
    size: m.size ?? '',
    type,
    alignment: m.alignment ?? '',
    ac: m.armor_class ?? 10,
    acDesc: m.armor_desc || undefined,
    hpAvg: m.hit_points ?? 1,
    hitDice: (m.hit_dice ?? '').replace(/\s+/g, ''),
    speed: m.speed ?? { walk: 30 },
    abilities: {
      str: m.strength ?? 10,
      dex: m.dexterity ?? 10,
      con: m.constitution ?? 10,
      int: m.intelligence ?? 10,
      wis: m.wisdom ?? 10,
      cha: m.charisma ?? 10,
    },
    saves: saves(m),
    skills: m.skills ?? {},
    vulnerabilities: m.damage_vulnerabilities || undefined,
    resistances: m.damage_resistances || undefined,
    immunities: m.damage_immunities || undefined,
    conditionImmunities: m.condition_immunities || undefined,
    senses: m.senses ?? '',
    languages: m.languages ?? '',
    cr: String(m.challenge_rating ?? m.cr ?? '0'),
    traits: entries(m.special_abilities),
    actions: entries(m.actions),
    bonusActions: entries(m.bonus_actions),
    reactions: entries(m.reactions),
    legendaryDesc: m.legendary_desc || undefined,
    legendaryActions: entries(m.legendary_actions),
    source: m.document__title || 'SRD',
    retired: false,
  };
}
