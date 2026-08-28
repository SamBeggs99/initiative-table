import {
  applyPersistSlice,
  getPersistSlice,
  useStore,
  waitForPersistHydration,
  type PersistSlice,
} from '../../store';
import { isCloudBlobEmpty, type UserBlobPayload } from './blob-shape';
import { fetchUserBlob, upsertUserBlob } from './blobs';
import { getSupabase } from './client';
import { onCloudDirty } from './dirty';
import { withTimeout } from './timeout';
import {
  readHomebrewCreatures,
  readHomebrewSpells,
  replaceHomebrewCreatures,
  replaceHomebrewSpells,
} from './homebrew';

const DEBOUNCE_MS = 1000;

let runId = 0;
let hydrated = false;
let pushing = false;
let dirtyDuringPush = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastPayloadJson = '';
let unsubStore: (() => void) | null = null;
let unsubDirty: (() => void) | null = null;
let unsubOnline: (() => void) | null = null;
let unsubHidden: (() => void) | null = null;

async function buildPayload(): Promise<UserBlobPayload> {
  const [homebrew_creatures, homebrew_spells] = await Promise.all([
    readHomebrewCreatures(),
    readHomebrewSpells(),
  ]);
  return {
    store: getPersistSlice(useStore.getState()),
    homebrew_creatures,
    homebrew_spells,
  };
}

function persistChanged(
  a: PersistSlice,
  b: PersistSlice,
): boolean {
  return (
    a.campaigns !== b.campaigns ||
    a.activeCampaignId !== b.activeCampaignId ||
    a.encounters !== b.encounters ||
    a.combatByCampaign !== b.combatByCampaign ||
    a.settings !== b.settings
  );
}

export function scheduleCloudPush(): void {
  if (!hydrated) return;
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushCloudNow();
  }, DEBOUNCE_MS);
}

export async function pushCloudNow(): Promise<void> {
  if (!hydrated) return;
  if (pushing) {
    dirtyDuringPush = true;
    return;
  }
  const client = getSupabase();
  if (!client) return;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return;

  pushing = true;
  try {
    const payload = await buildPayload();
    const json = JSON.stringify(payload);
    if (json === lastPayloadJson) return;
    await upsertUserBlob(session.user.id, payload);
    lastPayloadJson = json;
  } catch (err) {
    console.warn(
      'Cloud save failed',
      err instanceof Error ? err.message : err,
    );
  } finally {
    pushing = false;
    if (dirtyDuringPush) {
      dirtyDuringPush = false;
      scheduleCloudPush();
    }
  }
}

export async function startCloudSync(): Promise<'uploaded' | 'hydrated' | 'offline'> {
  const id = ++runId;
  clearListeners();
  await waitForPersistHydration();
  if (id !== runId) return 'offline';

  const client = getSupabase();
  if (!client) return 'offline';
  let session: { user: { id: string } } | null = null;
  try {
    const result = await withTimeout(client.auth.getSession(), 'auth session', 8000);
    session = result.data.session;
  } catch (err) {
    console.warn(
      'Cloud session read failed',
      err instanceof Error ? err.message : err,
    );
    return 'offline';
  }
  if (!session || id !== runId) return 'offline';

  try {
    const row = await fetchUserBlob(session.user.id);
    if (id !== runId) return 'offline';
    if (isCloudBlobEmpty(row) || !row) {
      const payload = await buildPayload();
      await upsertUserBlob(session.user.id, payload);
      if (id !== runId) return 'offline';
      lastPayloadJson = JSON.stringify(payload);
      hydrated = true;
      listen();
      return 'uploaded';
    }
    applyPersistSlice({
      campaigns: row.store?.campaigns ?? [],
      activeCampaignId: row.store?.activeCampaignId ?? null,
      encounters: row.store?.encounters ?? [],
      combatByCampaign: row.store?.combatByCampaign ?? {},
      settings: row.store?.settings ?? useStore.getState().settings,
    });
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
    if (id !== runId) return 'offline';
    lastPayloadJson = JSON.stringify(await buildPayload());
  } catch (err) {
    console.warn(
      'Cloud load failed; using local cache',
      err instanceof Error ? err.message : err,
    );
    if (id !== runId) return 'offline';
    hydrated = true;
    listen();
    return 'offline';
  }

  if (id !== runId) return 'offline';
  hydrated = true;
  listen();
  return 'hydrated';
}

function listen(): void {
  unsubStore = useStore.subscribe((state, prev) => {
    if (persistChanged(state, prev)) scheduleCloudPush();
  });
  unsubDirty = onCloudDirty(() => scheduleCloudPush());

  const onOnline = () => {
    void pushCloudNow();
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void pushCloudNow();
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
  lastPayloadJson = '';
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
  unsubHidden?.();
  unsubHidden = null;
}

export function stopCloudSync(): void {
  runId += 1;
  clearListeners();
}
