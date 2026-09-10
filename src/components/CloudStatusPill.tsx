import { useEffect, useState } from 'react';
import {
  getCloudStatus,
  subscribeCloudStatus,
  type CloudStatusState,
} from '../lib/cloud/status';
import { flushCloudNow } from '../lib/cloud/sync';

const LABEL: Record<CloudStatusState['status'], string> = {
  disabled: '',
  syncing: 'Syncing',
  saving: 'Saving',
  saved: 'Saved',
  offline: 'Offline',
  error: 'Not saved',
};

const TONE: Record<CloudStatusState['status'], string> = {
  disabled: '',
  syncing: 'text-muted',
  saving: 'text-muted',
  saved: 'text-heal',
  offline: 'text-amber',
  error: 'text-damage',
};

function agoLabel(at: number | null): string {
  if (at == null) return 'never';
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 90) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 90) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/**
 * Cloud save health, in the header where the DM can see it without asking.
 * A failing push used to be a `console.warn` and nothing else.
 */
export function CloudStatusPill() {
  const [state, setState] = useState<CloudStatusState>(getCloudStatus);

  useEffect(() => subscribeCloudStatus(setState), []);

  if (state.status === 'disabled') return null;

  const failing = state.status === 'error' || state.status === 'offline';
  const label = LABEL[state.status];
  const title = failing
    ? `${state.error ?? 'Cloud save is failing'} — last cloud save ${agoLabel(
        state.lastOkAt,
      )}. Your table is still saved on this device. Click to retry.`
    : `Last cloud save ${agoLabel(state.lastOkAt)}`;

  return (
    <button
      type="button"
      className={`chip shrink-0 gap-1.5 text-[11px] ${TONE[state.status]} ${
        failing ? 'border-damage/50' : ''
      }`}
      title={title}
      onClick={failing ? () => flushCloudNow() : undefined}
      aria-live="polite"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          failing
            ? 'bg-damage'
            : state.status === 'saved'
              ? 'bg-heal'
              : 'bg-muted animate-pulse'
        }`}
        aria-hidden
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
