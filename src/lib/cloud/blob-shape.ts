import type { Spell, StatBlock } from '../../types';
import type { PersistSlice } from '../../store';
import type { CloudPortrait } from './portraits';

export interface UserBlobPayload {
  store: PersistSlice;
  homebrew_creatures: StatBlock[];
  homebrew_spells: Spell[];
  /**
   * Character art, base64 by content id. Optional so a client talking to a
   * project whose `user_blobs` table predates the column still works — the
   * portraits just stay on the device that made them.
   */
  portraits?: CloudPortrait[];
}

export interface UserBlobRow extends UserBlobPayload {
  user_id: string;
  updated_at: string;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** True when there is no row, or the row has no campaigns, encounters, or homebrew. */
export function isCloudBlobEmpty(
  row: {
    store?: { campaigns?: unknown; encounters?: unknown } | null;
    homebrew_creatures?: unknown;
    homebrew_spells?: unknown;
    portraits?: unknown;
  } | null,
): boolean {
  if (!row) return true;
  const campaigns = asArray(row.store?.campaigns);
  const encounters = asArray(row.store?.encounters);
  const creatures = asArray(row.homebrew_creatures);
  const spells = asArray(row.homebrew_spells);
  // Portraits count: a row holding art but no sheets is still someone's data,
  // and treating it as empty would let a blank device overwrite it.
  const portraits = asArray(row.portraits);
  return (
    campaigns.length === 0 &&
    encounters.length === 0 &&
    creatures.length === 0 &&
    spells.length === 0 &&
    portraits.length === 0
  );
}
