import { bestiaryDb } from './bestiary/db';
import { spellDb } from './spells/db';

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

  // Portraits are content-addressed with no owner recorded, so there is nothing
  // to preserve — the next sign-in restores them from the cloud alongside the
  // sheets that reference them.
  await bestiaryDb.portraits.clear();
}
