import type { StatBlock, System } from '../../types';
import { bestiaryDb, creatureSearchFields, type CreatureRecord } from './db';

export interface SearchCreaturesQuery {
  system: System;
  campaignId?: string;
  query?: string;
  crRange?: { min?: number; max?: number };
  source?: string;
  origin?: StatBlock['origin'];
  /**
   * Cap on returned rows. Callers render 40 at most, and stopping early is what
   * lets the indexed fast path skip reading the rest of the table.
   */
  limit?: number;
}

export type ProvenanceBadge = 'SRD' | 'Homebrew' | 'This campaign' | string;

export interface CreatureSearchResult {
  creature: StatBlock;
  score: number;
  badge: ProvenanceBadge;
}

const DEFAULT_LIMIT = 40;

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

/** Index fields are written by a Dexie hook; fall back for any un-migrated row. */
function fieldsOf(c: CreatureRecord): { nameLower: string; searchText: string } {
  if (c.nameLower != null && c.searchText != null) {
    return { nameLower: c.nameLower, searchText: c.searchText };
  }
  const derived = creatureSearchFields(c);
  return { nameLower: derived.nameLower ?? '', searchText: derived.searchText ?? '' };
}

function scoreMatch(c: CreatureRecord, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const { nameLower, searchText } = fieldsOf(c);
  let score = 0;
  for (const t of tokens) {
    if (nameLower === t) score += 100;
    else if (nameLower.startsWith(t)) score += 60;
    else if (nameLower.includes(t)) score += 40;
    else if (searchText.includes(t)) score += 15;
    else return 0;
  }
  // Prefer homebrew on equal footing
  if (c.origin === 'homebrew') score += 5;
  else if (c.origin === 'bundled') score += 1;
  return score;
}

function compareResults(
  a: CreatureSearchResult,
  b: CreatureSearchResult,
): number {
  if (b.score !== a.score) return b.score - a.score;
  // Homebrew above synced on equal score
  const rank = (o: StatBlock['origin']) =>
    o === 'homebrew' ? 0 : o === 'bundled' ? 1 : 2;
  const r = rank(a.creature.origin) - rank(b.creature.origin);
  if (r !== 0) return r;
  return a.creature.name.localeCompare(b.creature.name);
}

/**
 * Visibility rules, applied identically on both search paths.
 * `syncedSlugs` is only needed to supersede bundled rows.
 */
function isVisible(
  c: CreatureRecord,
  q: SearchCreaturesQuery,
  syncedSlugs: Set<string> | null,
): boolean {
  if (c.system !== q.system) return false; // belt and braces
  if (q.origin && c.origin !== q.origin) return false;

  if (c.origin === 'synced') {
    if (c.retired) return false;
  } else if (c.origin === 'bundled') {
    if (syncedSlugs?.has(c.slug)) return false;
  } else if (c.origin === 'homebrew') {
    // global (no campaignId) OR this campaign only
    if (
      c.campaignId != null &&
      c.campaignId !== '' &&
      c.campaignId !== q.campaignId
    ) {
      return false;
    }
  } else {
    return false;
  }

  if (q.source && !c.source.toLowerCase().includes(q.source.toLowerCase())) {
    return false;
  }

  if (q.crRange) {
    const n = crToNumber(c.cr);
    if (Number.isNaN(n)) return false;
    if (q.crRange.min != null && n < q.crRange.min) return false;
    if (q.crRange.max != null && n > q.crRange.max) return false;
  }

  return true;
}

/** Slugs with a live synced row, which is what supersedes a bundled row. */
async function activeSyncedSlugs(system: System): Promise<Set<string>> {
  const synced = await bestiaryDb.creatures
    .where('[system+origin]')
    .equals([system, 'synced'])
    .toArray();
  return new Set(synced.filter((c) => !c.retired).map((c) => c.slug));
}

function tokenize(query: string | undefined): string[] {
  return (query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * THE only read path for listing creatures from the bestiary store.
 * Hard-filters by system. Never mixes systems. Hides retired synced rows.
 * Bundled rows are superseded by a synced record of the same slug.
 *
 * Two tiers. A single-token query — which is what typing a monster name is —
 * hits the `[system+nameLower]` prefix index and stops as soon as it has a full
 * page, because every prefix match scores at least 60 and every non-prefix
 * match at most 40, so the prefix page *is* the top of the full ranking. Only a
 * multi-token query, or a thin prefix result, walks the table. That walk is
 * itself much cheaper now that `searchText` is precomputed on write.
 */
export async function searchCreatures(
  q: SearchCreaturesQuery,
): Promise<CreatureSearchResult[]> {
  const tokens = tokenize(q.query);
  const limit = q.limit ?? DEFAULT_LIMIT;

  if (tokens.length === 1) {
    const fast = await prefixSearch(q, tokens[0]!, limit);
    if (fast) return fast;
  }

  return fullScan(q, tokens, limit);
}

/**
 * Returns null when the prefix tier cannot be trusted to hold the top of the
 * ranking — i.e. it did not fill a page — so the caller falls through.
 */
async function prefixSearch(
  q: SearchCreaturesQuery,
  token: string,
  limit: number,
): Promise<CreatureSearchResult[] | null> {
  const rows = await bestiaryDb.creatures
    .where('[system+nameLower]')
    .between([q.system, token], [q.system, `${token}￿`], true, true)
    // One extra so a page that is exactly full is still provably full.
    .limit(limit + 1)
    .toArray();

  if (rows.length <= limit) return null;

  // Bundled rows only need the synced-slug set when one is actually present.
  const syncedSlugs = rows.some((c) => c.origin === 'bundled')
    ? await activeSyncedSlugs(q.system)
    : null;

  const out: CreatureSearchResult[] = [];
  for (const creature of rows) {
    if (!isVisible(creature, q, syncedSlugs)) continue;
    const score = scoreMatch(creature, [token]);
    if (score <= 0) continue;
    out.push({ creature, score, badge: provenanceBadge(creature, q.campaignId) });
  }

  // Filters may have thinned it below a page; then the scan is authoritative.
  if (out.length <= limit) return null;

  out.sort(compareResults);
  return out.slice(0, limit);
}

async function fullScan(
  q: SearchCreaturesQuery,
  tokens: string[],
  limit: number,
): Promise<CreatureSearchResult[]> {
  const all = await bestiaryDb.creatures
    .where('system')
    .equals(q.system)
    .toArray();

  const syncedSlugs = new Set(
    all.filter((c) => c.origin === 'synced' && !c.retired).map((c) => c.slug),
  );

  const scored: CreatureSearchResult[] = [];
  for (const creature of all) {
    if (!isVisible(creature, q, syncedSlugs)) continue;
    const score = scoreMatch(creature, tokens);
    if (score <= 0) continue;
    scored.push({
      creature,
      score,
      badge: provenanceBadge(creature, q.campaignId),
    });
  }

  scored.sort(compareResults);
  return scored.slice(0, limit);
}
