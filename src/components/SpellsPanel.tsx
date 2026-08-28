import { useEffect, useMemo, useRef, useState } from 'react';
import {
  blankSpell,
  ensureSpellsSeeded,
  getSpellStats,
  searchSpells,
  type SpellSearchResult,
} from '../lib/spells';
import { getSystemAdapter } from '../systems';
import { useStore } from '../store';
import type { Spell } from '../types';
import { SpellEditor } from './spells/SpellEditor';
import { SpellPreview } from './spells/SpellPreview';
import { spellLevelLabel } from '../lib/spells';
import { Modal } from './ui/Modal';

function formatSyncedAt(ts?: number): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function SpellsPanel() {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const pushLog = useStore((s) => s.pushLog);

  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [results, setResults] = useState<SpellSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getSpellStats>> | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editor, setEditor] = useState<Spell | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ready, setReady] = useState(false);
  const autoSyncRef = useRef(false);

  const adapter = campaign ? getSystemAdapter(campaign.system) : null;
  const maxLevel = campaign?.system === 'pf2e' ? 10 : 9;

  const refreshStats = async () => {
    if (!campaign) return;
    setStats(await getSpellStats(campaign.system));
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        await ensureSpellsSeeded();
        if (!campaign || cancelled) return;
        const [nextStats, found] = await Promise.all([
          getSpellStats(campaign.system),
          searchSpells({
            system: campaign.system,
            campaignId: campaign.id,
            query,
            level: level === 'all' ? undefined : level,
          }),
        ]);
        if (!cancelled) {
          setStats(nextStats);
          setResults(found.slice(0, 60));
          setSelectedId((id) => id ?? found[0]?.spell.id ?? null);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setSyncMsg(err instanceof Error ? err.message : 'Could not open spells');
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, campaign?.system, refreshKey]);

  useEffect(() => {
    if (!campaign || !ready) {
      if (!campaign) setResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const found = await searchSpells({
        system: campaign.system,
        campaignId: campaign.id,
        query,
        level: level === 'all' ? undefined : level,
      });
      if (!cancelled) {
        setResults(found.slice(0, 60));
        if (found[0]) setSelectedId((id) => id ?? found[0]!.spell.id);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [campaign?.id, campaign?.system, query, level, ready]);

  const selected = useMemo(
    () => results.find((r) => r.spell.id === selectedId) ?? results[0],
    [results, selectedId],
  );

  const runSync = async () => {
    if (!adapter?.spells.syncEnabled || !adapter.spells.sync) return;
    setBusy(true);
    setSyncMsg('Fetching catalog…');
    try {
      const result = await adapter.spells.sync((p) => {
        setSyncMsg(p.message ?? 'Syncing…');
      });
      pushLog(
        `Spells synced: ${result.count} (${result.retired} retired)`,
        'system',
      );
      await refreshStats();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
      pushLog(
        `Spell sync failed: ${err instanceof Error ? err.message : String(err)}`,
        'system',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!ready || !adapter?.spells.syncEnabled) return;
    if (stats?.lastSyncedAt || autoSyncRef.current) return;
    autoSyncRef.current = true;
    void runSync();
  }, [ready, adapter, stats?.lastSyncedAt]);

  if (!campaign || !adapter) {
    return <p className="text-muted">Select a campaign to search spells.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
        <p className="min-w-0 flex-1">
          {adapter.spells.syncEnabled ? (
            <>
              <span className="text-text">
                {(stats?.totalVisible ?? 0).toLocaleString()}
              </span>
              {stats?.lastSyncedAt
                ? ` · ${formatSyncedAt(stats.lastSyncedAt)}`
                : busy
                  ? ' · fetching catalog'
                  : ' · bundled subset'}
            </>
          ) : (
            (adapter.spells.syncDisabledReason ?? 'Player Core subset + homebrew')
          )}
        </p>
        {adapter.spells.syncEnabled && (
          <button
            type="button"
            disabled={busy}
            className="btn btn-sm btn-ghost"
            onClick={() => void runSync()}
          >
            {busy ? 'Syncing…' : 'Sync'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-accent"
          onClick={() =>
            setEditor(blankSpell(campaign.system, { campaignId: campaign.id }))
          }
        >
          New
        </button>
      </div>
      {syncMsg && !busy && (
        <p className="text-[11px] text-muted">{syncMsg}</p>
      )}

      <div className="flex items-center gap-1">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search spells</span>
          <input
            id="spell-search"
            className="field w-full text-sm"
            placeholder="Search name, school, text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selected) {
                e.preventDefault();
                setPreviewOpen(true);
              }
            }}
          />
        </label>
        <label className="sr-only" htmlFor="spell-level">
          Level
        </label>
        <select
          id="spell-level"
          className="field w-[6.5rem] shrink-0 py-1 text-xs"
          value={level === 'all' ? 'all' : String(level)}
          onChange={(e) => {
            const v = e.target.value;
            setLevel(v === 'all' ? 'all' : Number(v));
          }}
        >
          <option value="all">All levels</option>
          <option value="0">Cantrip</option>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              Level {n}
            </option>
          ))}
        </select>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto text-sm">
        {!ready ? (
          <li className="p-2 text-xs text-muted">Loading spells…</li>
        ) : results.length === 0 ? (
          <li className="rounded border border-dashed border-border p-3 text-xs text-muted">
            No spells match. Try another name, or add homebrew.
          </li>
        ) : (
          results.map((r) => (
            <li key={r.spell.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  selected?.spell.id === r.spell.id
                    ? 'border-accent/50 bg-accent/10 text-text'
                    : 'border-transparent text-text hover:border-border hover:bg-panel-2'
                }`}
                onClick={() => {
                  setSelectedId(r.spell.id);
                  setPreviewOpen(true);
                }}
                onDoubleClick={() => {
                  if (r.spell.origin === 'homebrew') setEditor(r.spell);
                }}
              >
                <span className="name-identity min-w-0 flex-1 truncate">
                  {r.spell.name}
                </span>
                <span className="shrink-0 font-mono-stats text-[10px] tabular-nums text-muted">
                  {spellLevelLabel(r.spell)}
                </span>
                <span
                  className={`badge-soft shrink-0 ${
                    r.badge === 'Homebrew' || r.badge === 'This campaign'
                      ? 'badge-condition'
                      : ''
                  }`}
                >
                  {r.badge}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {previewOpen && selected && (
        <Modal
          title={selected.spell.name}
          size="lg"
          onClose={() => setPreviewOpen(false)}
          footer={
            selected.spell.origin === 'homebrew' ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setPreviewOpen(false);
                  setEditor(selected.spell);
                }}
              >
                Edit
              </button>
            ) : undefined
          }
        >
          <SpellPreview spell={selected.spell} hideTitle />
        </Modal>
      )}

      {editor && (
        <SpellEditor
          system={campaign.system}
          campaignId={campaign.id}
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setRefreshKey((k) => k + 1);
            void refreshStats();
          }}
          onDeleted={() => {
            setSelectedId(null);
            setRefreshKey((k) => k + 1);
            void refreshStats();
          }}
        />
      )}
    </div>
  );
}
