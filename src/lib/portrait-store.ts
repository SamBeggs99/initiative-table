import { bestiaryDb } from './bestiary/db';
import { notifyCloudDirty } from './cloud/dirty';

/**
 * Portrait bytes live here — a Dexie blob table keyed by content hash — and the
 * sheets that use them carry only an id.
 *
 * Before this, `portraitDataUrl` was a base64 string on `PartyMember`,
 * `NpcRecord` and `StatBlock`, all of which sit in campaign state and therefore
 * in localStorage. Base64 inflates by a third, browsers count localStorage in
 * UTF-16, and `Combatant.statBlock` is an embedded copy — so one 120 kB JPEG
 * cost roughly 320 kB of a ~5 MB budget, once per combatant carrying it. A
 * five-hero party plus ten portrait-bearing NPCs was most of the budget before
 * combat started, and hitting the wall silently stopped autosave.
 */

/** Hash the encoded bytes, so identical images share one row. */
async function contentId(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256-${hex.slice(0, 32)}`;
}

/** Store a portrait and return its id. A byte-identical image is a no-op. */
export async function putPortrait(blob: Blob): Promise<string> {
  const id = await contentId(blob);
  const existing = await bestiaryDb.portraits.get(id);
  if (!existing) {
    await bestiaryDb.portraits.put({
      id,
      blob,
      bytes: blob.size,
      at: Date.now(),
    });
    notifyCloudDirty();
  }
  return id;
}

export async function getPortrait(id: string): Promise<Blob | undefined> {
  return (await bestiaryDb.portraits.get(id))?.blob;
}

export async function listPortraitIds(): Promise<string[]> {
  return bestiaryDb.portraits.toCollection().primaryKeys();
}

/**
 * Object URLs, cached per id for the life of the page and deliberately never
 * revoked. Several components render the same portrait at once (roster row,
 * combat row, stat block preview), so per-component revocation would pull the
 * image out from under a sibling. The set is bounded by how many distinct
 * portraits a campaign has — dozens, at ~120 kB each — so holding them is
 * cheaper than the bookkeeping to refcount them.
 */
const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

export function cachedPortraitUrl(id: string): string | undefined {
  return urlCache.get(id);
}

export async function resolvePortraitUrl(
  id: string,
): Promise<string | undefined> {
  const cached = urlCache.get(id);
  if (cached) return cached;

  const inflight = pending.get(id);
  if (inflight) return inflight;

  const load = (async () => {
    try {
      const blob = await getPortrait(id);
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, load);
  return load;
}

/** Drop cached URLs. Called after a cloud pull replaces the blob table. */
export function resetPortraitUrlCache(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  pending.clear();
}

/**
 * Delete portraits nothing references any more. Called after a campaign or a
 * sheet is deleted; safe to run at any time because it is driven by the ids
 * actually in use rather than by refcounts kept alongside them.
 */
export async function pruneUnreferencedPortraits(
  referenced: Iterable<string>,
): Promise<number> {
  const keep = new Set(referenced);
  const all = await listPortraitIds();
  const dead = all.filter((id) => !keep.has(id));
  if (dead.length === 0) return 0;
  await bestiaryDb.portraits.bulkDelete(dead);
  for (const id of dead) {
    const url = urlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(id);
    }
  }
  notifyCloudDirty();
  return dead.length;
}
