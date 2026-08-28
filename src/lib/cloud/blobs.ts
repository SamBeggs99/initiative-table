import { getSupabase } from './client';
import type { UserBlobPayload, UserBlobRow } from './blob-shape';

export async function fetchUserBlob(userId: string): Promise<UserBlobRow | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('user_blobs')
    .select('user_id, store, homebrew_creatures, homebrew_spells, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as UserBlobRow;
}

export async function upsertUserBlob(
  userId: string,
  payload: UserBlobPayload,
): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('user_blobs').upsert({
    user_id: userId,
    store: payload.store,
    homebrew_creatures: payload.homebrew_creatures,
    homebrew_spells: payload.homebrew_spells,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
