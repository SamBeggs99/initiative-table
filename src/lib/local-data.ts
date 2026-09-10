import { bestiaryDb } from './bestiary/db';
import { spellDb } from './spells/db';
import { portraitSyncAvailable } from './cloud/blobs';

/**
 * Remove the account's data from this device's Dexie stores, leaving the SRD
 * catalogs alone.
 *
 * The distinction matters on sign-out: homebrew and portraits are the DM's own
 * work and belong to the account, so they follow the account. Synced and
 * bundled catalog rows are a per-device download that the next sign-in would
 * otherwise have to pull again over the venue's wifi.
 */
export async function clearUserOwnedTables(): Promise<void> {
  await bestiaryDb.transaction('rw', bestiaryDb.creatures, async () => {
    const homebrew = await bestiaryDb.creatures
      .where('origin')
      .equals('homebrew')
      .primaryKeys();
    if (homebrew.length > 0) await bestiaryDb.creatures.bulkDelete(homebrew);
  });

  await spellDb.transaction('rw', spellDb.spells, async () => {
    const homebrew = await spellDb.spells
      .where('origin')
      .equals('homebrew')
      .primaryKeys();
    if (homebrew.length > 0) await spellDb.spells.bulkDelete(homebrew);
  });

  /*
   * Portraits are only safe to clear once they are in the account.
   *
   * If this project's `user_blobs` table predates the `portraits` column, the
   * client degrades to device-local art — and clearing on sign-out would then
   * be deleting the only copy. Never delete what you failed to back up: keep
   * them, and let a later sign-out remove them once syncing works.
   */
  if (portraitSyncAvailable() === false) {
    console.warn(
      'Keeping portraits on this device: they are not syncing, so this is ' +
        'the only copy. Run the portraits column migration in ' +
        'supabase/schema.sql to let them follow the account.',
    );
    return;
  }
  await bestiaryDb.portraits.clear();
}
