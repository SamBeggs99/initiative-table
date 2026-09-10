import { useCloudAuth } from '../lib/cloud/auth-context';

/**
 * Shown for the whole session while the DM is working without a cloud session.
 *
 * It says the same thing the sign-in escape hatch said, because by round four
 * they will have forgotten which button they pressed an hour ago — and the one
 * fact that matters is that this work has not left the device yet.
 *
 * It is safe to promise the work survives: choosing to work offline sets the
 * store's `dirtySince` marker, so the next sign-in reaches `decideSync` with a
 * dirty local copy and can only push or ask. It can never silently pull over
 * this session.
 */
export function LocalOnlyBanner() {
  const { localOnly } = useCloudAuth();
  if (!localOnly) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber/50 bg-amber/12 px-3 py-1.5 text-xs sm:px-4"
      role="status"
    >
      <span className="font-semibold text-amber">Offline</span>
      <span className="min-w-0 flex-1 text-text">
        Saving to this device only. Sign in when you have a connection to send
        this session to your account.
      </span>
      <button
        type="button"
        className="btn btn-sm btn-ghost shrink-0"
        onClick={() => window.location.reload()}
        title="Reload and try reaching your account again"
      >
        Try sign-in
      </button>
    </div>
  );
}
