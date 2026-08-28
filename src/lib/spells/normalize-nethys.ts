import type { Spell } from '../../types';
import { deterministicCreatureId, slugifyName } from '../bestiary/ids';
import { parseSpellDamage } from '../parse';

/** Remaster Player Core books only — no Secrets of Magic, Rage of Elements, etc. */
export const NETHYS_CORE_SOURCES = ['Player Core', 'Player Core 2'] as const;

const CORE_SOURCE_SET = new Set<string>(NETHYS_CORE_SOURCES);

export interface NethysSpell {
  name?: string;
  level?: number;
  school?: string;
  category?: string;
  tradition?: string[];
  trait?: string[];
  trait_raw?: string[];
  component?: string[];
  actions?: string;
  range_raw?: string;
  area_raw?: string;
  duration?: string;
  duration_raw?: string;
  heighten?: string[];
  markdown?: string;
  primary_source?: string;
  primary_source_raw?: string;
  remaster_id?: string[];
  exclude_from_search?: boolean;
  id?: string;
  url?: string;
}

export function isNethysCoreSource(source: string | undefined): boolean {
  return CORE_SOURCE_SET.has((source ?? '').trim());
}

export function nethysActionCost(
  actions: string | undefined,
): NonNullable<Spell['pf2e']>['actions'] {
  const s = (actions ?? '').toLowerCase();
  if (s.includes('reaction')) return 'reaction';
  if (s.includes('free')) return 'free';
  if (s.includes('three') || /\b3\b/.test(s)) return 3;
  if (s.includes('two') || /\b2\b/.test(s)) return 2;
  return 1;
}

function castingTimeLabel(
  cost: NonNullable<Spell['pf2e']>['actions'],
): string {
  if (cost === 'reaction') return 'reaction';
  if (cost === 'free') return 'free action';
  if (cost === 1) return '1 action';
  return `${cost} actions`;
}

function cleanAonText(raw: string): string {
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
    .trim();
}

export function parseAonSpellMarkdown(markdown: string | undefined): {
  desc: string;
  heighten?: string;
} {
  const md = markdown ?? '';
  const chunks = md.split(/\n---\n/);
  const bodies: string[] = [];
  const heightens: string[] = [];
  for (const chunk of chunks.slice(1)) {
    const text = cleanAonText(chunk);
    if (!text) continue;
    if (/^heightened\b/i.test(text)) heightens.push(text);
    else bodies.push(text);
  }
  return {
    desc: bodies.join('\n\n').trim(),
    heighten: heightens.length > 0 ? heightens.join('\n') : undefined,
  };
}

/**
 * Map one Archives of Nethys Elasticsearch `_source` onto Spell.
 * Returns null when the hit is not Player Core / Player Core 2, was remastered
 * into a different id, or has no name.
 */
export function nethysToSpell(
  raw: NethysSpell,
  origin: 'synced' | 'bundled' = 'synced',
): Spell | null {
  const name = (raw.name ?? '').trim();
  if (!name) return null;
  if (raw.exclude_from_search) return null;
  if (!isNethysCoreSource(raw.primary_source)) return null;
  if (raw.remaster_id && raw.remaster_id.length > 0) return null;

  const slug = slugifyName(name);
  const traditions = (raw.tradition ?? []).map((t) => t.trim()).filter(Boolean);
  const traits = (raw.trait ?? raw.trait_raw ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const cost = nethysActionCost(raw.actions);
  const parsed = parseAonSpellMarkdown(raw.markdown);
  const heighten =
    parsed.heighten ||
    (raw.heighten?.length
      ? `Heightened (${raw.heighten.join(', ')})`
      : undefined);
  const rangeParts = [raw.range_raw?.trim(), raw.area_raw?.trim()].filter(
    Boolean,
  );
  const now = Date.now();
  const school = (raw.school ?? '').trim() || '';
  const damage = parseSpellDamage(parsed.desc);

  return {
    id: deterministicCreatureId('pf2e', 'nethys', slug),
    system: 'pf2e',
    origin,
    slug,
    name,
    level: typeof raw.level === 'number' ? raw.level : 1,
    school,
    castingTime: castingTimeLabel(cost),
    range: rangeParts.join('; ') || '',
    components: (raw.component ?? []).map((c) => c.trim()).filter(Boolean).join(', '),
    duration: (raw.duration_raw ?? raw.duration ?? '').trim() || 'Instantaneous',
    classes: traditions.map((t) => t.toLowerCase()),
    desc: parsed.desc,
    higherLevel: heighten,
    source: (raw.primary_source_raw ?? raw.primary_source ?? 'Player Core').trim(),
    pf2e: {
      traditions: traditions.map((t) => t.toLowerCase()),
      traits: traits.map((t) => t.toLowerCase()),
      actions: cost,
      heighten,
      ...(damage ? { damage } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Disambiguate when two core spells share a slug. */
export function uniquifyNethysSpellId(spell: Spell, aonId: string, taken: Set<string>): Spell {
  if (!taken.has(spell.id)) return spell;
  const suffix = aonId.replace(/^spell-/i, '') || slugifyName(aonId);
  const slug = `${spell.slug}-${suffix}`;
  return {
    ...spell,
    id: deterministicCreatureId('pf2e', 'nethys', slug),
    slug,
  };
}
