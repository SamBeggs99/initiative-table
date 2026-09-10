import {
  applyPersistSlice,
  currentEditSeq,
  getPersistSlice,
  persistChanged,
  useStore,
  waitForPersistHydration,
} from '../../store';
import { isCloudBlobEmpty, type UserBlobPayload, type UserBlobRow } from './blob-shape';
import { fetchUserBlob, upsertUserBlob } from './blobs';
import { getSupabase } from './client';
import { onCloudDirty, onCloudFlushRequest } from './dirty';
import { decideSync } from './merge';
import { setCloudStatus } from './status';
import { withTimeout } from './timeout';
import {
  readHomebrewCreatures,
  readHomebrewSpells,
  replaceHomebrewCreatures,
  replaceHomebrewSpells,
} from './homebrew';
import { applyPortraitPayload, buildPortraitPayload } from './portraits';

/**
 * Campaign edits are already durable in localStorage the instant they happen,
 * so the cloud copy does not need per-keystroke fidelity. What it needs is to
 * be current at the moments that matter, which `flushCloudNow` covers.
 */
const DEBOUNCE_MS = 3000;

let runId = 0;
let hydrated = false;
let pushing = false;
let dirtyDuringPush = false;
/** The push currently in flight, so a caller that needs certainty can wait. */
let inflightPush: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsubStore: (() => void) | null = null;
let unsubDirty: (() => void) | null = null;
let unsubOnline: (() => void) | null = null;
let unsubFlush: (() => void) | null = null;
let unsubHidden: (() => void) | null = null;

/**
 * Homebrew lives in Dexie, so building a payload used to mean two full table
 * reads — on every debounced push, i.e. continuously through a fight, to send
 * one changed HP value. Cache it and let `onCloudDirty` (which homebrew
 * mutators already call) be the only thing that invalidates.
 */
let homebrewCache: {
  creatures: UserBlobPayload['homebrew_creatures'];
  spells: UserBlobPayload['homebrew_spells'];
} | null = null;

/**
 * Portraits are the same problem an order of magnitude larger: base64 art that
 * changes about once a session, in a payload that is otherwise rebuilt every
 * few seconds during a fight. Cached behind the same signal.
 */
let portraitCache: UserBlobPayload['portraits'] | null = null;

function invalidateHomebrewCache(): void {
  homebrewCache = null;
  portraitCache = null;
}

async function readHomebrew(): Promise<NonNullable<typeof homebrewCache>> {
  if (homebrewCache) return homebrewCache;
  const [creatures, spells] = await Promise.all([
    readHomebrewCreatures(),
    readHomebrewSpells(),
  ]);
  homebrewCache = { creatures, spells };
  return homebrewCache;
}

async function readPortraits(): Promise<UserBlobPayload['portraits']> {
  portraitCache ??= await buildPortraitPayload();
  return portraitCache;
}

async function buildPayload(): Promise<UserBlobPayload> {
  const [homebrew, portraits] = await Promise.all([
    readHomebrew(),
    readPortraits(),
  ]);
  return {
    store: getPersistSlice(useStore.getState()),
    homebrew_creatures: homebrew.creatures,
    homebrew_spells: homebrew.spells,
    portraits,
  };
}

function localIsEmpty(): boolean {
  const s = useStore.getState();
  return s.campaigns.length === 0 && s.encounters.length === 0;
}

export function scheduleCloudPush(): void {
  if (!hydrated) return;
  if (timer != null) clearTimeout(timer);
  setCloudStatus('saving');
  timer = setTimeout(() => {
    timer = null;
    void pushCloudNow();
  }, DEBOUNCE_MS);
}

/**
 * Push immediately, skipping the debounce. Called at the points where losing the
 * last few seconds would actually cost the DM something: tab hidden, network
 * back, and the end of a fight or session.
 *
 * `awaitCompletion` returns a promise that rejects if the push failed, which
 * sign-out needs — it clears the device afterwards and must not do that on the
 * strength of a push that never landed.
 */
export function flushCloudNow(opts?: {
  awaitCompletion?: boolean;
}): Promise<void> {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!hydrated) return Promise.resolve();
  const run = pushCloudNow({ rethrow: opts?.awaitCompletion });
  if (!opts?.awaitCompletion) {
    void run.catch(() => {});
    return Promise.resolve();
  }
  return run;
}

export async function pushCloudNow(opts?: {
  /** Surface the failure instead of only logging it (used by sign-out). */
  rethrow?: boolean;
}): Promise<void> {
  if (!hydrated) return;
  if (pushing) {
    dirtyDuringPush = true;
    // A caller that needs certainty must wait for the in-flight push, not
    // return as though its own work had been saved.
    if (opts?.rethrow && inflightPush) await inflightPush;
    return;
  }
  const client = getSupabase();
  if (!client) return;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return;

  pushing = true;
  const seq = currentEditSeq();
  const run = (async () => {
    try {
      setCloudStatus('saving');
      const payload = await buildPayload();
      const updatedAt = await upsertUserBlob(session.user.id, payload);
      useStore.getState().markCloudSynced(updatedAt, seq);
      setCloudStatus('saved', { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Cloud save failed', message);
      setCloudStatus(navigator.onLine === false ? 'offline' : 'error', {
        error: message,
      });
      if (opts?.rethrow) throw err;
    } finally {
      pushing = false;
      inflightPush = null;
      if (dirtyDuringPush) {
        dirtyDuringPush = false;
        scheduleCloudPush();
      }
    }
  })();
  inflightPush = run;
  return run;
}

/** Replace local state with the cloud row and take its stamp as the baseline. */
async function pullRemote(row: UserBlobRow): Promise<void> {
  applyPersistSlice(
    {
      campaigns: row.store?.campaigns ?? [],
      activeCampaignId: row.store?.activeCampaignId ?? null,
      encounters: row.store?.encounters ?? [],
      combatByCampaign: row.store?.combatByCampaign ?? {},
      settings: row.store?.settings ?? useStore.getState().settings,
    },
    row.updated_at ?? null,
  );
  await withTimeout(
    replaceHomebrewCreatures(
      Array.isArray(row.homebrew_creatures) ? row.homebrew_creatures : [],
    ),
    'homebrew creatures',
  );
  await withTimeout(
    replaceHomebrewSpells(
      Array.isArray(row.homebrew_spells) ? row.homebrew_spells : [],
    ),
    'homebrew spells',
  );
  // Portraits before anything renders, so a pulled sheet shows its face rather
  // than an empty frame that fills in a moment later.
  await withTimeout(applyPortraitPayload(row.portraits), 'portraits', 20_000);
  invalidateHomebrewCache();
}

async function pushLocal(userId: string): Promise<void> {
  const seq = currentEditSeq();
  const payload = await buildPayload();
  const updatedAt = await upsertUserBlob(userId, payload);
  useStore.getState().markCloudSynced(updatedAt, seq);
}

/** A fork the DM has to resolve. Both branches finish the sync when chosen. */
export interface CloudConflict {
  /** When this device's first unpushed change landed. */
  localDirtySince: number;
  /** When the cloud copy was last written, by whatever device. */
  remoteUpdatedAt: string | null;
  localCampaignCount: number;
  remoteCampaignCount: number;
  /** Overwrite the cloud with this device. */
  keepLocal: () => Promise<void>;
  /** Discard this device's unpushed work and take the cloud copy. */
  useRemote: () => Promise<void>;
}

export type CloudSyncOutcome =
  | { kind: 'uploaded' }
  | { kind: 'hydrated' }
  | { kind: 'in-step' }
  | { kind: 'offline' }
  | { kind: 'conflict'; conflict: CloudConflict };

export async function startCloudSync(): Promise<CloudSyncOutcome> {
  const id = ++runId;
  clearListeners();
  await waitForPersistHydration();
  if (id !== runId) return { kind: 'offline' };

  const client = getSupabase();
  if (!client) {
    setCloudStatus('disabled');
    return { kind: 'offline' };
  }

  setCloudStatus('syncing');
  let session: { user: { id: string } } | null = null;
  try {
    const result = await withTimeout(client.auth.getSession(), 'auth session', 8000);
    session = result.data.session;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Cloud session read failed', message);
    setCloudStatus('offline', { error: message });
    return { kind: 'offline' };
  }
  if (!session || id !== runId) {
    setCloudStatus('offline');
    return { kind: 'offline' };
  }
  const userId = session.user.id;

  try {
    const row = await fetchUserBlob(userId);
    if (id !== runId) return { kind: 'offline' };

    const { cloudMeta } = useStore.getState();
    const decision = decideSync({
      localDirtySince: cloudMeta.dirtySince,
      lastSyncedAt: cloudMeta.lastSyncedAt,
      remoteUpdatedAt: row?.updated_at ?? null,
      remoteEmpty: isCloudBlobEmpty(row),
      localEmpty: localIsEmpty(),
    });

    // A conflict must not start the push listener — that would race the DM's
    // answer and overwrite the cloud before they picked a side.
    if (decision.kind === 'conflict' && row) {
      setCloudStatus('syncing');
      const finish = () => {
        if (id !== runId) return;
        hydrated = true;
        listen();
        setCloudStatus('saved', { ok: true });
      };
      return {
        kind: 'conflict',
        conflict: {
          localDirtySince: cloudMeta.dirtySince ?? Date.now(),
          remoteUpdatedAt: row.updated_at ?? null,
          localCampaignCount: useStore.getState().campaigns.length,
          remoteCampaignCount: Array.isArray(row.store?.campaigns)
            ? row.store.campaigns.length
            : 0,
          keepLocal: async () => {
            await pushLocal(userId);
            finish();
          },
          useRemote: async () => {
            await pullRemote(row);
            finish();
          },
        },
      };
    }

    if (decision.kind === 'pull' && row) {
      await pullRemote(row);
      if (id !== runId) return { kind: 'offline' };
      hydrated = true;
      listen();
      setCloudStatus('saved', { ok: true });
      return { kind: 'hydrated' };
    }

    if (decision.kind === 'push') {
      await pushLocal(userId);
      if (id !== runId) return { kind: 'offline' };
      hydrated = true;
      listen();
      setCloudStatus('saved', { ok: true });
      return { kind: 'uploaded' };
    }

    hydrated = true;
    listen();
    setCloudStatus('saved', { ok: true });
    return { kind: 'in-step' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Cloud load failed; using local cache', message);
    if (id !== runId) return { kind: 'offline' };
    // Local state is untouched and still authoritative. Listen anyway so work
    // done now reaches the cloud once the network comes back.
    hydrated = true;
    listen();
    setCloudStatus('offline', { error: message });
    return { kind: 'offline' };
  }
}

function listen(): void {
  unsubStore = useStore.subscribe((state, prev) => {
    if (persistChanged(state, prev)) scheduleCloudPush();
  });
  unsubDirty = onCloudDirty(() => {
    invalidateHomebrewCache();
    scheduleCloudPush();
  });

  unsubFlush = onCloudFlushRequest(() => void flushCloudNow());

  const onOnline = () => void flushCloudNow();
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flushCloudNow();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onHidden);
  unsubOnline = () => window.removeEventListener('online', onOnline);
  unsubHidden = () => document.removeEventListener('visibilitychange', onHidden);
}

function clearListeners(): void {
  hydrated = false;
  pushing = false;
  dirtyDuringPush = false;
  inflightPush = null;
  invalidateHomebrewCache();
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  unsubStore?.();
  unsubStore = null;
  unsubDirty?.();
  unsubDirty = null;
  unsubOnline?.();
  unsubOnline = null;
  unsubFlush?.();
  unsubFlush = null;
  unsubHidden?.();
  unsubHidden = null;
}

export function stopCloudSync(): void {
  runId += 1;
  clearListeners();
  setCloudStatus('disabled');
}
