type Listener = () => void;

const listeners = new Set<Listener>();
const flushListeners = new Set<Listener>();

/** Homebrew lives in Dexie, not Zustand — mutators call this so cloud save can follow. */
export function notifyCloudDirty(): void {
  for (const listener of listeners) listener();
}

export function onCloudDirty(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask for an immediate cloud push, skipping the debounce. The store calls this
 * at the points where the last few seconds actually matter — end fight, end
 * session, clear encounter — without importing the sync module, which imports
 * the store.
 */
export function requestCloudFlush(): void {
  for (const listener of flushListeners) listener();
}

export function onCloudFlushRequest(listener: Listener): () => void {
  flushListeners.add(listener);
  return () => {
    flushListeners.delete(listener);
  };
}
