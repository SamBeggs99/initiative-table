/**
 * Which way the cloud row and this device's state should move on sign-in.
 *
 * Before this existed, hydrate unconditionally called `applyPersistSlice` with
 * whatever the cloud held, so a device holding unpushed work — a session run
 * with the lid closed before the debounced push landed, or run offline — lost
 * it silently the moment the app reopened. Nothing compared timestamps even
 * though `updated_at` was already being selected.
 */
export type SyncDecision =
  /** Cloud is authoritative; replace local. */
  | { kind: 'pull' }
  /** This device is authoritative; upload it. */
  | { kind: 'push' }
  /** Both moved since the last common point — the DM has to choose. */
  | { kind: 'conflict' }
  /** Already in step. */
  | { kind: 'noop' };

export interface SyncDecisionInput {
  /** When the first un-pushed local change landed, or null if in step. */
  localDirtySince: number | null;
  /** `updated_at` of the cloud row as of our last successful sync. */
  lastSyncedAt: string | null;
  /** `updated_at` of the cloud row right now, or null when there is no row. */
  remoteUpdatedAt: string | null;
  /** No row, or a row with no campaigns / encounters / homebrew. */
  remoteEmpty: boolean;
  /** This device has no campaigns and no encounters. */
  localEmpty: boolean;
}

export function decideSync(input: SyncDecisionInput): SyncDecision {
  const {
    localDirtySince,
    lastSyncedAt,
    remoteUpdatedAt,
    remoteEmpty,
    localEmpty,
  } = input;

  // Nothing in the cloud worth protecting — seed it from this device.
  if (remoteEmpty) return { kind: 'push' };

  // Nothing on this device worth protecting — take the cloud copy.
  if (localEmpty) return { kind: 'pull' };

  const remoteMoved = remoteUpdatedAt !== lastSyncedAt;

  if (localDirtySince == null) {
    // In step locally; follow the cloud if another device advanced it.
    return remoteMoved ? { kind: 'pull' } : { kind: 'noop' };
  }

  // Local has unpushed work. Safe to push only if the cloud is exactly where we
  // left it. A never-synced device (lastSyncedAt null) with real local work and
  // a non-empty cloud row is a genuine fork, so it asks.
  if (!remoteMoved && lastSyncedAt != null) return { kind: 'push' };

  return { kind: 'conflict' };
}
