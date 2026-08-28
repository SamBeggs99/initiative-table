import type { Spell, System } from '../../types';
import { spellDb } from './db';

export interface SearchSpellsQuery {
  system: System;
  campaignId?: string;
  query?: string;
  level?: number;
  school?: string;
  origin?: Spell['origin'];
}

export type SpellBadge = 'SRD' | 'Homebrew' | 'This campaign' | string;

export interface SpellSearchResult {
  spell: Spell;
  score: number;
  badge: SpellBadge;
}

export function spellBadge(spell: Spell, campaignId?: string): SpellBadge {
  if (spell.origin === 'homebrew') {
    return spell.campaignId && spell.campaignId === campaignId
      ? 'This campaign'
      : 'Homebrew';
  }
  if (spell.origin === 'bundled') return 'SRD';
  const src = spell.source || '';
  if (/srd/i.test(src) || src === '5e Core Rules' || src === 'SRD 5.1' || /^Player Core/.test(src)) {
    return 'SRD';
  }
  return src || 'Synced';
}

function haystack(s: Spell): string {
  return [
    s.name,
    s.school,
    s.source,
    s.desc,
    s.higherLevel ?? '',
    s.classes.join(' '),
    s.pf2e?.traditions.join(' ') ?? '',
    s.pf2e?.traits.join(' ') ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function scoreMatch(s: Spell, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const name = s.name.toLowerCase();
  const hay = haystack(s);
  let score = 0;
  for (const t of tokens) {
    if (name === t) score += 100;
    else if (name.startsWith(t)) score += 60;
    else if (name.includes(t)) score += 40;
    else if (hay.includes(t)) score += 15;
    else return 0;
  }
  if (s.origin === 'homebrew') score += 5;
  else if (s.origin === 'bundled') score += 1;
  return score;
}

export async function searchSpells(
  q: SearchSpellsQuery,
): Promise<SpellSearchResult[]> {
  const { system, campaignId, query, level, school, origin } = q;
  const all = await spellDb.spells.where('system').equals(system).toArray();
  const syncedActive = all.filter((s) => s.origin === 'synced' && !s.retired);
  const syncedSlugs = new Set(syncedActive.map((s) => s.slug));

  const candidates = all.filter((s) => {
    if (s.system !== system) return false;
    if (origin && s.origin !== origin) return false;
    if (s.origin === 'synced') {
      if (s.retired) return false;
    } else if (s.origin === 'bundled') {
      if (syncedSlugs.has(s.slug)) return false;
    } else if (s.origin === 'homebrew') {
      if (s.campaignId != null && s.campaignId !== '' && s.campaignId !== campaignId) {
        return false;
      }
    } else {
      return false;
    }
    if (level != null) {
      const isCantrip =
        s.level === 0 || Boolean(s.pf2e?.traits.includes('cantrip'));
      if (level === 0) {
        if (!isCantrip) return false;
      } else {
        if (isCantrip || s.level !== level) return false;
      }
    }
    if (school && !s.school.toLowerCase().includes(school.toLowerCase())) {
      return false;
    }
    return true;
  });

  const tokens = (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const scored = candidates
    .map((spell) => ({
      spell,
      score: scoreMatch(spell, tokens),
      badge: spellBadge(spell, campaignId),
    }))
    .filter((r) => r.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.spell.level !== b.spell.level) return a.spell.level - b.spell.level;
    return a.spell.name.localeCompare(b.spell.name);
  });

  return scored;
}
