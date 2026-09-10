import { getSupabase } from './client';
import type { UserBlobPayload, UserBlobRow } from './blob-shape';
import { withTimeout } from './timeout';

const BASE_COLUMNS = 'user_id, store, homebrew_creatures, homebrew_spells, updated_at';
const WITH_PORTRAITS = `${BASE_COLUMNS}, portraits`;

/**
 * `portraits` was added to `user_blobs` after the first release. A project that
 * has not run the `alter table` in supabase/schema.sql would otherwise fail
 * every read and write with an undefined-column error, taking the whole sync
 * down rather than just the portraits — so probe once and fall back.
 */
let portraitColumn: 'unknown' | 'present' | 'absent' = 'unknown';

function isMissingPortraitColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === '42703') return true;
  return /portraits/i.test(error.message ?? '') &&
    /does not exist|could not find|unknown/i.test(error.message ?? '');
}

function noteMissingColumn(): void {
  if (portraitColumn !== 'absent') {
    portraitColumn = 'absent';
    console.warn(
      'The user_blobs table has no `portraits` column, so portraits will not ' +
        'sync. Run the alter statement in supabase/schema.sql to enable it.',
    );
  }
}

export async function fetchUserBlob(userId: string): Promise<UserBlobRow | null> {
  const client = getSupabase();
  if (!client) return null;

  const read = (columns: string) =>
    withTimeout(
      client.from('user_blobs').select(columns).eq('user_id', userId).maybeSingle(),
      'cloud fetch',
    );

  if (portraitColumn !== 'absent') {
    const { data, error } = await read(WITH_PORTRAITS);
    if (!error) {
      portraitColumn = 'present';
      return data ? (data as unknown as UserBlobRow) : null;
    }
    if (!isMissingPortraitColumn(error)) throw new Error(error.message);
    noteMissingColumn();
  }

  const { data, error } = await read(BASE_COLUMNS);
  if (error) throw new Error(error.message);
  return data ? (data as unknown as UserBlobRow) : null;
}

/**
 * Write the blob and return the `updated_at` it now carries. The caller records
 * it as the sync baseline, which is what lets the next sign-in tell "the cloud
 * moved because of me" apart from "the cloud moved because of another device".
 */
export async function upsertUserBlob(
  userId: string,
  payload: UserBlobPayload,
): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const updatedAt = new Date().toISOString();

  const base = {
    user_id: userId,
    store: payload.store,
    homebrew_creatures: payload.homebrew_creatures,
    homebrew_spells: payload.homebrew_spells,
    updated_at: updatedAt,
  };

  const write = (row: Record<string, unknown>) =>
    withTimeout(client.from('user_blobs').upsert(row), 'cloud save');

  if (portraitColumn !== 'absent') {
    const { error } = await write({
      ...base,
      portraits: payload.portraits ?? [],
    });
    if (!error) {
      portraitColumn = 'present';
      return updatedAt;
    }
    if (!isMissingPortraitColumn(error)) throw new Error(error.message);
    noteMissingColumn();
  }

  const { error } = await write(base);
  if (error) throw new Error(error.message);
  return updatedAt;
}

/** True when this project's table can carry portraits. Null before first sync. */
export function portraitSyncAvailable(): boolean | null {
  return portraitColumn === 'unknown' ? null : portraitColumn === 'present';
}
