import { pruneUnreferencedPortraits } from './portrait-store';
import { referencedPortraitIds } from './cloud/portraits';

/**
 * Drop portraits nothing points at any more.
 *
 * Content addressing means a portrait can be shared by several sheets, so
 * deleting a sheet cannot delete its picture — the only safe answer is to
 * compare the table against the ids actually in use. Deferred and coalesced,
 * because it walks every campaign and there is no reason to do that in the same
 * tick as the delete the DM just clicked.
 */
let scheduled: ReturnType<typeof setTimeout> | null = null;

export function schedulePortraitGc(delayMs = 4000): void {
  if (scheduled != null) clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    scheduled = null;
    void (async () => {
      try {
        const referenced = await referencedPortraitIds();
        const removed = await pruneUnreferencedPortraits(referenced);
        if (removed > 0) {
          console.info(`Removed ${removed} unused portrait(s)`);
        }
      } catch (err) {
        console.warn(
          'Portrait cleanup failed; unused art stays on this device',
          err instanceof Error ? err.message : err,
        );
      }
    })();
  }, delayMs);
}
