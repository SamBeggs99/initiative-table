import { bestiaryDb } from '../bestiary/db';
import { resetPortraitUrlCache } from '../portrait-store';
import { useStore } from '../../store';

/**
 * Portraits in the cloud blob, as base64 keyed by content id.
 *
 * They have to travel, for two reasons that reinforce each other: a portrait is
 * part of a character sheet, and sign-out now clears the device — so anything
 * device-local would be destroyed rather than parked, and signing in elsewhere
 * would show sheets with holes where the faces were.
 *
 * jsonb means base64, which is a third bigger than the bytes. That is why this
 * is a separate section of the payload with its own change signal: a fight
 * pushing HP every few seconds must not re-upload the party's faces with it.
 */
export interface CloudPortrait {
  id: string;
  /** JPEG bytes, base64, no data-URL prefix. */
  b64: string;
  type: string;
}

/**
 * Ceiling on the whole synced set. Each portrait is already capped at ~120 kB
 * by `PORTRAIT_MAX_BYTES`; this stops a 40-NPC campaign from growing a blob
 * that the API will reject outright.
 */
export const PORTRAIT_SYNC_BUDGET_BYTES = 4 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Every portrait id the account's data actually points at.
 *
 * Driven from the references rather than from the table, so an orphan left by a
 * deleted NPC is not uploaded, and the set stays honest without refcounting.
 */
export async function referencedPortraitIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const add = (id: string | undefined) => {
    if (id) ids.add(id);
  };

  for (const campaign of useStore.getState().campaigns) {
    for (const member of campaign.party) add(member.portraitId);
    for (const npc of campaign.npcs) {
      add(npc.portraitId);
      add(npc.statBlock?.portraitId);
    }
  }
  for (const combat of Object.values(useStore.getState().combatByCampaign)) {
    for (const c of combat.combatants) add(c.statBlock?.portraitId);
  }
  // Homebrew creatures are account data too; synced and bundled rows are not.
  const homebrew = await bestiaryDb.creatures
    .where('origin')
    .equals('homebrew')
    .toArray();
  for (const creature of homebrew) add(creature.portraitId);

  return ids;
}

export async function buildPortraitPayload(): Promise<CloudPortrait[]> {
  const wanted = await referencedPortraitIds();
  if (wanted.size === 0) return [];

  const rows = await bestiaryDb.portraits.bulkGet([...wanted]);
  const out: CloudPortrait[] = [];
  let total = 0;
  for (const row of rows) {
    if (!row) continue;
    if (total + row.bytes > PORTRAIT_SYNC_BUDGET_BYTES) {
      console.warn(
        `Portrait sync budget reached; ${
          wanted.size - out.length
        } portrait(s) stay on this device only`,
      );
      break;
    }
    total += row.bytes;
    const buf = new Uint8Array(await row.blob.arrayBuffer());
    out.push({
      id: row.id,
      b64: bytesToBase64(buf),
      type: row.blob.type || 'image/jpeg',
    });
  }
  return out;
}

/**
 * Write pulled portraits into the local store. Additive: a local portrait the
 * cloud has not seen is left alone, because it may be mid-upload.
 */
export async function applyPortraitPayload(
  payload: unknown,
): Promise<number> {
  if (!Array.isArray(payload)) return 0;
  let written = 0;
  for (const entry of payload) {
    const row = entry as Partial<CloudPortrait>;
    if (typeof row?.id !== 'string' || typeof row.b64 !== 'string') continue;
    if (await bestiaryDb.portraits.get(row.id)) continue;
    try {
      const blob = base64ToBlob(row.b64, row.type || 'image/jpeg');
      await bestiaryDb.portraits.put({
        id: row.id,
        blob,
        bytes: blob.size,
        at: Date.now(),
      });
      written += 1;
    } catch (err) {
      console.warn(
        `Skipped an unreadable portrait (${row.id})`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (written > 0) resetPortraitUrlCache();
  return written;
}
