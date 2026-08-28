import type { Spell } from '../../types';
import { deterministicCreatureId, slugifyName } from '../bestiary/ids';

export interface Open5eSpell {
  slug?: string;
  name: string;
  desc?: string;
  higher_level?: string;
  range?: string;
  components?: string;
  material?: string;
  ritual?: string | boolean;
  duration?: string;
  concentration?: string | boolean;
  casting_time?: string;
  level_int?: number;
  spell_level?: number;
  school?: string;
  dnd_class?: string;
  spell_lists?: string[];
  document__slug?: string;
  document__title?: string;
}

function yes(v: string | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
  return false;
}

function componentsLine(raw: Open5eSpell): string {
  const base = (raw.components ?? '').trim();
  const mat = (raw.material ?? '').trim();
  if (mat && base && !base.toLowerCase().includes(mat.toLowerCase())) {
    return `${base} (${mat})`;
  }
  return base || (mat ? `M (${mat})` : '');
}

export function open5eToSpell(
  raw: Open5eSpell,
  origin: 'synced' | 'bundled' = 'synced',
): Spell {
  const sourceSlug = raw.document__slug || 'wotc-srd';
  const slug = raw.slug || slugifyName(raw.name);
  const level =
    typeof raw.level_int === 'number'
      ? raw.level_int
      : typeof raw.spell_level === 'number'
        ? raw.spell_level
        : 0;
  const classes =
    raw.spell_lists?.length
      ? raw.spell_lists.map((c) => c.trim()).filter(Boolean)
      : (raw.dnd_class ?? '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
  const now = Date.now();
  const higher = raw.higher_level?.trim();
  return {
    id: deterministicCreatureId('dnd5e', sourceSlug, slug),
    system: 'dnd5e',
    origin,
    slug,
    name: raw.name,
    level,
    school: (raw.school ?? '').trim() || 'evocation',
    castingTime: raw.casting_time?.trim() || '1 action',
    range: raw.range?.trim() || '',
    components: componentsLine(raw),
    duration: raw.duration?.trim() || '',
    concentration: yes(raw.concentration),
    ritual: yes(raw.ritual),
    classes,
    desc: (raw.desc ?? '').trim(),
    higherLevel: higher || undefined,
    source: raw.document__title || '5e SRD',
    createdAt: now,
    updatedAt: now,
  };
}
