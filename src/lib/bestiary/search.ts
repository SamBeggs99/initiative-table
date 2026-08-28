import type { StatBlock, System } from '../../types';
import { bestiaryDb } from './db';

export interface SearchCreaturesQuery {
  system: System;
  campaignId?: string;
  query?: string;
  crRange?: { min?: number; max?: number };
  source?: string;
  origin?: StatBlock['origin'];
}

export type ProvenanceBadge = 'SRD' | 'Homebrew' | 'This campaign' | string;

export interface CreatureSearchResult {
  creature: StatBlock;
  score: number;
  badge: ProvenanceBadge;
}

function crToNumber(cr: string): number {
  if (cr === '1/8') return 0.125;
  if (cr === '1/4') return 0.25;
  if (cr === '1/2') return 0.5;
  const n = Number(cr);
  return Number.isFinite(n) ? n : NaN;
}

export function provenanceBadge(
  creature: StatBlock,
  campaignId?: string,
): ProvenanceBadge {
  if (creature.origin === 'homebrew') {
    return creature.campaignId && creature.campaignId === campaignId
      ? 'This campaign'
      : 'Homebrew';
  }
  if (creature.origin === 'bundled') return 'SRD';
  const src = creature.source || '';
  if (/srd/i.test(src) || src === '5e SRD' || src === 'SRD 5.1') return 'SRD';
  return src || 'Synced';
}

function haystack(c: StatBlock): string {
  const parts = [
    c.name,
    c.type,
    c.cr,
    c.source,
    ...c.traits.map((t) => `${t.name} ${t.desc}`),
    ...c.actions.map((t) => `${t.name} ${t.desc}`),
    ...c.bonusActions.map((t) => `${t.name} ${t.desc}`),
    ...c.reactions.map((t) => `${t.name} ${t.desc}`),
    ...c.legendaryActions.map((t) => `${t.name} ${t.desc}`),
  ];
  return parts.join(' ').toLowerCase();
}

function scoreMatch(c: StatBlock, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const name = c.name.toLowerCase();
  const hay = haystack(c);
  let score = 0;
  for (const t of tokens) {
    if (name === t) score += 100;
    else if (name.startsWith(t)) score += 60;
    else if (name.includes(t)) score += 40;
    else if (hay.includes(t)) score += 15;
    else return 0;
  }
  // Prefer homebrew on equal footing
  if (c.origin === 'homebrew') score += 5;
  else if (c.origin === 'bundled') score += 1;
  return score;
}

/**
 * THE only read path for listing creatures from the bestiary store.
 * Hard-filters by system. Never mixes systems. Hides retired synced rows.
 * Bundled rows are superseded by a synced record of the same slug.
 */
export async function searchCreatures(
  q: SearchCreaturesQuery,
): Promise<CreatureSearchResult[]> {
  const { system, campaignId, query, crRange, source, origin } = q;

  const all = await bestiaryDb.creatures.where('system').equals(system).toArray();

  const syncedActive = all.filter((c) => c.origin === 'synced' && !c.retired);
  const syncedSlugs = new Set(syncedActive.map((c) => c.slug));

  const candidates = all.filter((c) => {
    if (c.system !== system) return false; // belt and braces
    if (origin && c.origin !== origin) return false;

    if (c.origin === 'synced') {
      if (c.retired) return false;
    } else if (c.origin === 'bundled') {
      if (syncedSlugs.has(c.slug)) return false;
    } else if (c.origin === 'homebrew') {
      // global (no campaignId) OR this campaign only
      if (c.campaignId != null && c.campaignId !== '' && c.campaignId !== campaignId) {
        return false;
      }
    } else {
      return false;
    }

    if (source && !c.source.toLowerCase().includes(source.toLowerCase())) {
      return false;
    }

    if (crRange) {
      const n = crToNumber(c.cr);
      if (Number.isNaN(n)) return false;
      if (crRange.min != null && n < crRange.min) return false;
      if (crRange.max != null && n > crRange.max) return false;
    }

    return true;
  });

  const tokens = (query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const scored: CreatureSearchResult[] = [];
  for (const creature of candidates) {
    const score = scoreMatch(creature, tokens);
    if (score <= 0) continue;
    scored.push({
      creature,
      score,
      badge: provenanceBadge(creature, campaignId),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Homebrew above synced on equal score
    const rank = (o: StatBlock['origin']) =>
      o === 'homebrew' ? 0 : o === 'bundled' ? 1 : 2;
    const r = rank(a.creature.origin) - rank(b.creature.origin);
    if (r !== 0) return r;
    return a.creature.name.localeCompare(b.creature.name);
  });

  return scored;
}
