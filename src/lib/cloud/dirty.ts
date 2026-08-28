type Listener = () => void;

const listeners = new Set<Listener>();

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
