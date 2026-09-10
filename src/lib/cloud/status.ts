/**
 * Cloud save health, published so the UI can say so out loud. Before this
 * existed a failing push was a `console.warn` and the DM had no way to know
 * their table had stopped reaching the cloud.
 */
export type CloudStatus =
  | 'disabled'
  | 'syncing'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'error';

export interface CloudStatusState {
  status: CloudStatus;
  /** Last successful push or pull, epoch ms. */
  lastOkAt: number | null;
  /** Message from the most recent failure, for the tooltip. */
  error: string | null;
}

let state: CloudStatusState = {
  status: 'disabled',
  lastOkAt: null,
  error: null,
};

type Listener = (s: CloudStatusState) => void;
const listeners = new Set<Listener>();

export function getCloudStatus(): CloudStatusState {
  return state;
}

export function setCloudStatus(
  status: CloudStatus,
  opts?: { error?: string | null; ok?: boolean },
): void {
  state = {
    status,
    lastOkAt: opts?.ok ? Date.now() : state.lastOkAt,
    error: opts?.error ?? (status === 'error' ? state.error : null),
  };
  for (const listener of listeners) listener(state);
}

export function subscribeCloudStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
