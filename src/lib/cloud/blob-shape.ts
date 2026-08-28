import type { Spell, StatBlock } from '../../types';
import type { PersistSlice } from '../../store';

export interface UserBlobPayload {
  store: PersistSlice;
  homebrew_creatures: StatBlock[];
  homebrew_spells: Spell[];
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
  } | null,
): boolean {
  if (!row) return true;
  const campaigns = asArray(row.store?.campaigns);
  const encounters = asArray(row.store?.encounters);
  const creatures = asArray(row.homebrew_creatures);
  const spells = asArray(row.homebrew_spells);
  return (
    campaigns.length === 0 &&
    encounters.length === 0 &&
    creatures.length === 0 &&
    spells.length === 0
  );
}
