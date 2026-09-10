import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { useCloudAuth } from '../lib/cloud/auth-context';
import { useStore } from '../store';
import {
  getCloudStatus,
  subscribeCloudStatus,
  type CloudStatusState,
} from '../lib/cloud/status';

function when(value: string | number | null): string {
  if (value == null) return 'never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Sign-out now clears this device, so it has to say so before it happens.
 *
 * The old behaviour left campaigns in localStorage after sign-out — present on
 * disk but unreachable through the UI, and visible to whoever opened the
 * browser next. Since campaigns live in the account and signing in anywhere
 * restores them, clearing is the coherent choice; the honest part is showing
 * whether the last save actually landed first.
 */
export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const { email, signOut } = useCloudAuth();
  const [status, setStatus] = useState<CloudStatusState>(getCloudStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtySince = useStore((s) => s.cloudMeta.dirtySince);
  const campaignCount = useStore((s) => s.campaigns.length);

  useEffect(() => subscribeCloudStatus(setStatus), []);

  const unsaved = dirtySince != null;
  const failing = status.status === 'error' || status.status === 'offline';

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Sign out"
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${failing ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? 'Saving and signing out…' : 'Save and sign out'}
          </button>
        </>
      }
    >
      <p className="text-sm text-text">
        {campaignCount === 1
          ? 'Your campaign will be saved to your account and removed from this device.'
          : `Your ${campaignCount} campaigns will be saved to your account and removed from this device.`}{' '}
        Signing in again — here or anywhere else — loads them back.
      </p>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Account</dt>
          <dd className="truncate text-text">{email ?? 'unknown'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Last cloud save</dt>
          <dd className="font-mono-stats tabular-nums text-text">
            {when(status.lastOkAt)}
          </dd>
        </div>
        {unsaved && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Unsaved since</dt>
            <dd className="font-mono-stats tabular-nums text-amber">
              {when(dirtySince)}
            </dd>
          </div>
        )}
      </dl>

      {failing ? (
        <p className="mt-3 rounded border border-damage/50 bg-damage/10 px-3 py-2 text-xs leading-relaxed text-text">
          <b>Cloud saving is currently failing.</b> This device will not be
          cleared unless the final save succeeds, so nothing is lost either way
          — but you may want to wait for a connection, or export the campaign
          from Settings first.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          The SRD monster and spell catalogs stay on this device, so the next
          sign-in does not have to download them again.
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-damage" role="alert">
          Could not sign out: {error}
        </p>
      )}
    </Modal>
  );
}
