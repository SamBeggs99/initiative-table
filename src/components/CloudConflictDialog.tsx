import { useState } from 'react';
import { Modal } from './ui/Modal';
import type { CloudConflict } from '../lib/cloud/sync';

function when(value: number | string | null): string {
  if (value == null) return 'unknown';
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Shown when this device and the cloud both moved since they were last in step.
 * Deliberately blocking and deliberately not defaulted — either branch destroys
 * a session's work, so the DM picks, not us.
 */
export function CloudConflictDialog({
  conflict,
  onResolved,
}: {
  conflict: CloudConflict;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<'local' | 'remote' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (side: 'local' | 'remote') => async () => {
    setBusy(side);
    setError(null);
    try {
      await (side === 'local' ? conflict.keepLocal() : conflict.useRemote());
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Two copies of your table"
      // No close affordance path: dismissing without choosing would leave the
      // app running unsynced with no indication of which copy is live.
      onClose={() => {}}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={busy != null}
            onClick={run('remote')}
          >
            {busy === 'remote' ? 'Loading…' : 'Use the cloud copy'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy != null}
            onClick={run('local')}
          >
            {busy === 'local' ? 'Saving…' : 'Keep this device'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-text">
        This device has changes that never reached the cloud, and the cloud has
        been written since — probably from another device. Only one can survive.
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-accent/50 bg-panel-2/60 px-3 py-2">
          <div className="text-xs font-semibold text-text">This device</div>
          <div className="mt-1 font-mono-stats text-[11px] tabular-nums text-muted">
            unsaved since {when(conflict.localDirtySince)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {plural(conflict.localCampaignCount, 'campaign')}
          </div>
        </div>
        <div className="rounded border border-border px-3 py-2">
          <div className="text-xs font-semibold text-text">Cloud copy</div>
          <div className="mt-1 font-mono-stats text-[11px] tabular-nums text-muted">
            saved {when(conflict.remoteUpdatedAt)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {plural(conflict.remoteCampaignCount, 'campaign')}
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        <b>Keep this device</b> overwrites the cloud with what is on this screen.{' '}
        <b>Use the cloud copy</b> discards this device&apos;s unsaved changes. If
        you want both, keep this device now, export the campaign from Settings,
        then sign in on the other device and import it there.
      </p>
      {error && (
        <p className="mt-3 text-xs text-damage" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
