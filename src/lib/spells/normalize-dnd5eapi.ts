import type { Spell } from '../../types';
import { deterministicCreatureId } from '../bestiary/ids';

/** Keep existing Dexie / creature-ref ids (`dnd5e:wotc-srd:fireball`). */
export const DND5EAPI_SOURCE_SLUG = 'wotc-srd';

export interface Dnd5eApiRef {
  index?: string;
  name?: string;
  url?: string;
}

export interface Dnd5eApiSpell {
  index?: string;
  name?: string;
  desc?: string[];
  higher_level?: string[];
  range?: string;
  components?: string[];
  material?: string;
  ritual?: boolean;
  duration?: string;
  concentration?: boolean;
  casting_time?: string;
  level?: number;
  school?: { name?: string };
  classes?: Dnd5eApiRef[];
}

function joinParagraphs(parts: string[] | undefined): string {
  return (parts ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');
}

function componentsLine(raw: Dnd5eApiSpell): string {
  const base = (raw.components ?? []).map((c) => c.trim()).filter(Boolean).join(', ');
  const mat = (raw.material ?? '').trim();
  if (mat && base && !base.toLowerCase().includes(mat.toLowerCase())) {
    return `${base} (${mat})`;
  }
  return base || (mat ? `M (${mat})` : '');
}

export function dnd5eApiToSpell(
  raw: Dnd5eApiSpell,
  origin: 'synced' | 'bundled' = 'synced',
): Spell | null {
  const name = raw.name?.trim();
  const slug = raw.index?.trim();
  if (!name || !slug) return null;

  const now = Date.now();
  const higher = joinParagraphs(raw.higher_level);
  return {
    id: deterministicCreatureId('dnd5e', DND5EAPI_SOURCE_SLUG, slug),
    system: 'dnd5e',
    origin,
    slug,
    name,
    level: typeof raw.level === 'number' ? raw.level : 0,
    school: (raw.school?.name ?? '').trim() || 'evocation',
    castingTime: raw.casting_time?.trim() || '1 action',
    range: raw.range?.trim() || '',
    components: componentsLine(raw),
    duration: raw.duration?.trim() || '',
    concentration: Boolean(raw.concentration),
    ritual: Boolean(raw.ritual),
    classes: (raw.classes ?? [])
      .map((c) => (c.name ?? c.index ?? '').trim().toLowerCase())
      .filter(Boolean),
    desc: joinParagraphs(raw.desc),
    higherLevel: higher || undefined,
    source: 'SRD 5.1',
    createdAt: now,
    updatedAt: now,
  };
}
