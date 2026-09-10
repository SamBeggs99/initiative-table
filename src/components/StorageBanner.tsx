import { useStore } from '../store';
import { downloadText } from '../lib/session-log';

/**
 * Persistent, because the condition is persistent. A toast auto-dismisses after
 * five seconds; running an entire session with autosave silently dead is the
 * failure this app is explicitly not allowed to have.
 */
export function StorageBanner() {
  const blocked = useStore((s) => s.storageBlocked);
  const exportJson = useStore((s) => s.exportActiveCampaignJson);
  const campaignName = useStore(
    (s) => s.campaigns.find((c) => c.id === s.activeCampaignId)?.name,
  );

  if (!blocked) return null;

  const onExport = () => {
    const json = exportJson();
    if (!json) return;
    downloadText(
      `${campaignName ?? 'campaign'}-backup.json`,
      json,
      'application/json',
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-damage/50 bg-damage/12 px-3 py-2 text-xs sm:px-4"
      role="alert"
    >
      <span className="font-semibold text-damage">Not saving</span>
      <span className="min-w-0 flex-1 text-text">
        {blocked === 'full'
          ? 'This browser’s storage is full, so changes are only in memory. Export now — a reload will lose them.'
          : 'This browser is blocking site storage, so changes are only in memory. Export now — a reload will lose them.'}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-primary shrink-0"
        onClick={onExport}
      >
        Export campaign
      </button>
    </div>
  );
}
