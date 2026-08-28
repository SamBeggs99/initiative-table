import { useEffect, useState } from 'react';
import {
  ensureBundledSeeded,
  getBestiaryStats,
  syncOpen5eBestiary,
  type SyncProgress,
} from '../lib/bestiary';
import { downloadText } from '../lib/session-log';
import { getSystemAdapter, SYSTEM_ADAPTERS } from '../systems';
import { selectActiveCombatants, useStore } from '../store';
import type { System } from '../types';
import { useCloudAuth } from '../lib/cloud/auth-context';

function formatSyncedAt(ts?: number): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CampaignSettings({ onClose }: { onClose: () => void }) {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const combatants = useStore(selectActiveCombatants);
  const updateCampaign = useStore((s) => s.updateCampaign);
  const changeCampaignSystem = useStore((s) => s.changeCampaignSystem);
  const exportActiveCampaignJson = useStore((s) => s.exportActiveCampaignJson);
  const importCampaignJson = useStore((s) => s.importCampaignJson);
  const pushLog = useStore((s) => s.pushLog);
  const [pendingSystem, setPendingSystem] = useState<System | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [stats5e, setStats5e] = useState<Awaited<ReturnType<typeof getBestiaryStats>> | null>(
    null,
  );
  const [statsPf, setStatsPf] = useState<Awaited<ReturnType<typeof getBestiaryStats>> | null>(
    null,
  );
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureBundledSeeded();
      const [a, b] = await Promise.all([
        getBestiaryStats('dnd5e'),
        getBestiaryStats('pf2e'),
      ]);
      if (!cancelled) {
        setStats5e(a);
        setStatsPf(b);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!campaign) return null;

  const adapter = getSystemAdapter(campaign.system);
  const hasCombatants = combatants.length > 0;
  const hasParty = campaign.party.length > 0;
  const risky = hasCombatants || hasParty;

  const confirmSystemChange = () => {
    if (!pendingSystem) return;
    changeCampaignSystem(campaign.id, pendingSystem);
    setPendingSystem(null);
  };

  const runSync = async () => {
    setSyncBusy(true);
    setSyncMsg('Starting sync…');
    try {
      const result = await syncOpen5eBestiary((p: SyncProgress) => {
        setSyncMsg(p.message ?? p.phase);
      });
      setStats5e(await getBestiaryStats('dnd5e'));
      pushLog(
        `Bestiary synced: ${result.count} creatures (${result.retired} retired)`,
        'system',
      );
      setSyncMsg(`Done — ${result.count.toLocaleString()} creatures`);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-settings-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-auto card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="campaign-settings-title" className="text-sm font-semibold text-text">
            Campaign settings
          </h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-muted hover:text-text"
            onClick={onClose}
          >
            Esc
          </button>
        </div>

        <div className="space-y-4 p-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Name</span>
            <input
              className="w-full rounded border border-border bg-panel-2 px-2 py-1.5 text-text"
              value={campaign.name}
              onChange={(e) => updateCampaign(campaign.id, { name: e.target.value })}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">System</span>
            <select
              className="w-full rounded border border-border bg-panel-2 px-2 py-1.5 text-text"
              value={campaign.system}
              onChange={(e) => {
                const next = e.target.value as System;
                if (next === campaign.system) return;
                if (risky) setPendingSystem(next);
                else changeCampaignSystem(campaign.id, next);
              }}
            >
              {Object.values(SYSTEM_ADAPTERS).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Active adapter: <span className="text-text">{adapter.label}</span>
              {' · '}
              {adapter.turnStructure === 'legendary' ? 'legendary / reactions' : 'three actions + MAP'}
              {' · '}
              {adapter.downedModel === 'death-saves' ? 'death saves' : 'dying / wounded'}
            </p>
          </div>

          <div className="space-y-2 rounded border border-border bg-panel-2 p-3 text-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Bestiary</h3>
            <p className="text-text">
              5e bestiary:{' '}
              {(stats5e?.totalVisible ?? 0).toLocaleString()} creatures, synced{' '}
              {formatSyncedAt(stats5e?.lastSyncedAt)}
              {stats5e && stats5e.retired > 0
                ? ` · ${stats5e.retired} retired (still resolvable by id)`
                : ''}
            </p>
            <button
              type="button"
              disabled={syncBusy}
              className="btn"
              onClick={runSync}
            >
              {syncBusy ? 'Syncing…' : 'Re-sync 5e bestiary'}
            </button>
            {syncMsg && <p className="text-muted">{syncMsg}</p>}
            <p className="text-muted">
              PF2e bestiary: not synced — homebrew and pasted only
              {statsPf && statsPf.homebrew > 0
                ? ` (${statsPf.homebrew} homebrew)`
                : ''}
            </p>
            <p className="leading-relaxed text-muted">
              {getSystemAdapter('pf2e').bestiary.syncDisabledReason}
            </p>
          </div>

          {adapter.resources.kind === 'focus-hero' && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
                Party hero points
              </span>
              <input
                type="number"
                min={0}
                className="w-24 rounded border border-border bg-panel-2 px-2 py-1.5 font-mono-stats tabular-nums text-text"
                value={campaign.heroPoints ?? 0}
                onChange={(e) =>
                  updateCampaign(campaign.id, {
                    heroPoints: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              Session number
            </span>
            <input
              type="number"
              min={1}
              className="w-24 rounded border border-border bg-panel-2 px-2 py-1.5 font-mono-stats tabular-nums text-text"
              value={campaign.sessionNumber ?? 1}
              onChange={(e) =>
                updateCampaign(campaign.id, {
                  sessionNumber: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>

          <div className="space-y-2 border-t border-border pt-3">
            <h3 className="text-xs uppercase tracking-wider text-muted">Portable save</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const json = exportActiveCampaignJson();
                  if (!json) return;
                  downloadText(
                    `${campaign.name.replace(/\s+/g, '-').toLowerCase()}.json`,
                    json,
                    'application/json',
                  );
                }}
              >
                Export campaign JSON
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setImportOpen((v) => !v);
                  setImportError(null);
                }}
              >
                Import campaign JSON
              </button>
            </div>
            {importOpen && (
              <div className="space-y-2">
                <textarea
                  className="min-h-[100px] w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono text-xs text-text"
                  placeholder="Paste campaign export JSON…"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                {importError && <p className="text-xs text-damage">{importError}</p>}
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => {
                    const result = importCampaignJson(importText);
                    if (!result.ok) {
                      setImportError(result.error);
                      return;
                    }
                    setImportOpen(false);
                    setImportText('');
                    onClose();
                  }}
                >
                  Import as new campaign
                </button>
              </div>
            )}
          </div>

          <AccountSettings />

          {pendingSystem && (
            <div
              className="rounded border border-damage/60 bg-damage/10 p-3 text-xs leading-relaxed text-text"
              role="alert"
            >
              <p className="font-semibold text-damage">
                Changing system clears system-specific resources
              </p>
              <p className="mt-1 text-muted">
                Switching to {getSystemAdapter(pendingSystem).label} will drop spell slots, legendary
                actions, death saves, focus points, dying/wounded values, action pips, and MAP on
                existing combatants and party members. Stat blocks and HP remain.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded border border-damage bg-panel px-2 py-1 text-damage"
                  onClick={confirmSystemChange}
                >
                  Change system
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPendingSystem(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountSettings() {
  const { configured, email, signOut } = useCloudAuth();
  if (!configured) return null;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h3 className="text-xs uppercase tracking-wider text-muted">Account</h3>
      <p className="text-xs text-text">
        Signed in as {email ?? 'your account'}. Campaigns and homebrew save to
        the cloud on this login.
      </p>
      <button type="button" className="btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
