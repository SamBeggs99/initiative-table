import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCombatantsFromStatBlock,
  ensureBundledSeeded,
  getBestiaryStats,
  searchCreatures,
  setCreaturePortrait,
  type CreatureSearchResult,
} from '../lib/bestiary';
import { npcFromStatBlock } from '../lib/npc';
import { getSystemAdapter } from '../systems';
import { useStore } from '../store';
import type { NpcRecord, StatBlock } from '../types';
import { CreatureEditor, type EditorMode } from './statblock/CreatureEditor';
import {
  StatBlockPreview,
  creatureCatalogLine,
} from './statblock/StatBlockPreview';
import { NpcQuickEditor } from './NpcPanel';
import { PortraitField, PortraitThumb } from './ui/Portrait';
import { Modal } from './ui/Modal';

function formatSyncedAt(ts?: number): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BestiaryPanel() {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const settings = useStore((s) => s.settings);
  const addCombatant = useStore((s) => s.addCombatant);
  const upsertNpc = useStore((s) => s.upsertNpc);
  const pushLog = useStore((s) => s.pushLog);
  const pushToast = useStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatureSearchResult[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getBestiaryStats>> | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    mode: EditorMode;
    initial?: StatBlock;
  } | null>(null);
  const [npcDraft, setNpcDraft] = useState<NpcRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bestiaryReady, setBestiaryReady] = useState(false);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const autoSyncRef = useRef(false);

  const adapter = campaign ? getSystemAdapter(campaign.system) : null;

  const refreshStats = async () => {
    if (!campaign) return;
    setStats(await getBestiaryStats(campaign.system));
  };

  const refreshSearch = async () => {
    if (!campaign) return;
    const found = await searchCreatures({
      system: campaign.system,
      campaignId: campaign.id,
      query,
    });
    setResults(found.slice(0, 40));
  };

  useEffect(() => {
    let cancelled = false;
    setBestiaryReady(false);
    (async () => {
      try {
        if (!campaign || cancelled) return;
        // Do not wait on 5e SRD seeding before showing PF2e (or already-synced 5e).
        const seed = ensureBundledSeeded();
        const [nextStats, found] = await Promise.all([
          getBestiaryStats(campaign.system),
          searchCreatures({
            system: campaign.system,
            campaignId: campaign.id,
            query,
          }),
        ]);
        if (!cancelled) {
          setStats(nextStats);
          setResults(found.slice(0, 40));
          setSelectedId((id) => id ?? found[0]?.creature.id ?? null);
          setBestiaryReady(true);
        }
        await seed;
        if (cancelled || campaign.system !== 'dnd5e') return;
        const [seededStats, seededFound] = await Promise.all([
          getBestiaryStats(campaign.system),
          searchCreatures({
            system: campaign.system,
            campaignId: campaign.id,
            query,
          }),
        ]);
        if (!cancelled) {
          setStats(seededStats);
          setResults(seededFound.slice(0, 40));
        }
      } catch (err) {
        if (!cancelled) {
          setSyncMsg(err instanceof Error ? err.message : 'Could not open bestiary');
          setBestiaryReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, campaign?.system, refreshKey]);

  useEffect(() => {
    if (!campaign) {
      setResults([]);
      return;
    }
    if (!bestiaryReady) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const found = await searchCreatures({
        system: campaign.system,
        campaignId: campaign.id,
        query,
      });
      if (!cancelled) {
        setResults(found.slice(0, 40));
        if (found[0]) setSelectedId((id) => id ?? found[0]!.creature.id);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [campaign?.id, campaign?.system, query, bestiaryReady]);

  const selected = useMemo(
    () => results.find((r) => r.creature.id === selectedId) ?? results[0],
    [results, selectedId],
  );

  useEffect(() => {
    autoSyncRef.current = false;
  }, [campaign?.id, campaign?.system]);

  const runSync = async () => {
    if (!adapter?.bestiary.syncEnabled || !adapter.bestiary.sync) return;
    setBusy(true);
    setSyncMsg('Fetching catalog…');
    try {
      const result = await adapter.bestiary.sync((p) => {
        setSyncMsg(p.message ?? 'Syncing…');
      });
      pushLog(
        `Bestiary synced: ${result.count} creatures (${result.retired} retired)`,
        'system',
      );
      await refreshStats();
      await refreshSearch();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed');
      pushLog(
        `Bestiary sync failed: ${err instanceof Error ? err.message : String(err)}`,
        'system',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!bestiaryReady || !adapter?.bestiary.syncEnabled) return;
    if (stats?.lastSyncedAt || autoSyncRef.current) return;
    autoSyncRef.current = true;
    void runSync();
  }, [bestiaryReady, adapter, stats?.lastSyncedAt]);

  if (!campaign || !adapter) {
    return <p className="text-muted">Select a campaign to search the bestiary.</p>;
  }

  const addCreature = (creature: StatBlock, count: number) => {
    const combatants = buildCombatantsFromStatBlock(creature, {
      quantity: count,
      hpMode: settings.hpRollMode,
    });
    for (const c of combatants) addCombatant(c);
    pushToast(
      `${creature.name}${combatants.length > 1 ? ` ×${combatants.length}` : ''} added to combat`,
    );
  };

  const addSelected = () => {
    if (!selected) return;
    addCreature(selected.creature, quantity);
  };

  const toNpc = () => {
    if (!selected) return;
    setNpcDraft(npcFromStatBlock(selected.creature));
  };

  const catalogCount = (stats?.totalVisible ?? 0).toLocaleString();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
        <p className="min-w-0 flex-1">
          {adapter.bestiary.syncEnabled ? (
            <>
              <span className="text-text">{catalogCount}</span>
              {stats?.lastSyncedAt
                ? ` · ${formatSyncedAt(stats.lastSyncedAt)}`
                : busy
                  ? ' · fetching catalog'
                  : campaign.system === 'pf2e'
                    ? ' · Monster Core'
                    : ' · bundled SRD'}
              {stats && stats.retired > 0 ? ` · ${stats.retired} retired` : ''}
            </>
          ) : (
            'PF2e: homebrew and paste only'
          )}
        </p>
        {adapter.bestiary.syncEnabled && (
          <button
            type="button"
            disabled={busy}
            className="btn btn-sm"
            onClick={() => void runSync()}
          >
            {busy ? 'Syncing…' : 'Sync'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setEditor({ mode: 'new' })}
        >
          New
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setEditor({ mode: 'import' })}
        >
          Import
        </button>
      </div>
      {syncMsg && !busy && (
        <p className="text-[11px] text-muted">{syncMsg}</p>
      )}
      {!adapter.bestiary.syncEnabled && adapter.bestiary.syncDisabledReason && (
        <p className="text-[11px] leading-relaxed text-muted">
          {adapter.bestiary.syncDisabledReason}
        </p>
      )}

      <div className="flex items-center gap-1">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search creatures</span>
          <input
            className="field w-full text-sm"
            placeholder="Search, then Enter or +Combat"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selected) {
                e.preventDefault();
                addSelected();
              }
            }}
            id="bestiary-search"
          />
        </label>
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
          Qty
          <input
            type="number"
            min={1}
            max={12}
            className="field w-12 py-0.5 font-mono-stats tabular-nums"
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.min(12, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </label>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto text-sm">
        {!bestiaryReady ? (
          <li className="text-muted">Loading creatures…</li>
        ) : results.length === 0 && busy ? (
          <li className="text-muted">{syncMsg ?? 'Fetching catalog…'}</li>
        ) : results.length === 0 ? (
          <li className="space-y-2 py-2 text-xs leading-relaxed text-muted">
            {!adapter.bestiary.syncEnabled ? (
              <p>
                No PF2e creatures yet. There is no bundled PF2e catalog — build one
                with <span className="text-text">New</span> or{' '}
                <span className="text-text">Import</span>.
              </p>
            ) : query.trim() ? (
              <p>
                No matches for “<span className="text-text">{query.trim()}</span>”.
                {!stats?.lastSyncedAt
                  ? campaign.system === 'pf2e'
                    ? ' Sync to load Monster Core, or add it as homebrew.'
                    : ' Only the bundled SRD creatures are available offline — sync for the full Open5e catalog.'
                  : ' Try a different name, or add it as homebrew.'}
              </p>
            ) : (
              <p>
                {campaign.system === 'pf2e'
                  ? 'No creatures available. Sync Monster Core from Archives of Nethys, or create your own.'
                  : 'No creatures available. Sync the Open5e catalog, or create your own.'}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="btn btn-sm btn-accent"
                onClick={() => setEditor({ mode: 'new' })}
              >
                New
              </button>
              {adapter.bestiary.syncEnabled && !stats?.lastSyncedAt && (
                <button
                  type="button"
                  disabled={busy}
                  className="btn btn-sm"
                  onClick={runSync}
                >
                  {busy ? 'Syncing…' : 'Sync'}
                </button>
              )}
            </div>
          </li>
        ) : (
          results.map((r) => (
            <li key={r.creature.id} className="flex items-center gap-1">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  selected?.creature.id === r.creature.id
                    ? 'border-accent/50 bg-accent/10 text-text'
                    : 'border-transparent text-text hover:border-border hover:bg-panel-2'
                }`}
                onClick={() => {
                  setSelectedId(r.creature.id);
                  setSheetOpen(true);
                }}
                onDoubleClick={() => {
                  setSheetOpen(false);
                  if (r.creature.origin === 'homebrew') {
                    setEditor({ mode: 'edit', initial: r.creature });
                  } else {
                    setEditor({ mode: 'clone', initial: r.creature });
                  }
                }}
              >
                <PortraitThumb
                  src={r.creature.portraitDataUrl}
                  alt=""
                  size="xs"
                />
                <span className="min-w-0 flex-1 truncate">{r.creature.name}</span>
                {(r.badge === 'Homebrew' || r.badge === 'This campaign') && (
                  <span className="badge-soft badge-condition shrink-0">HB</span>
                )}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-accent shrink-0"
                aria-label={`Add ${quantity} ${r.creature.name} to combat`}
                title={`Add ${quantity} to combat`}
                onClick={() => addCreature(r.creature, quantity)}
              >
                +Combat
              </button>
            </li>
          ))
        )}
      </ul>

      {selected && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setSheetOpen(true)}
            >
              <p className="truncate text-xs text-text">{selected.creature.name}</p>
              <p className="truncate text-[11px] text-text">
                {creatureCatalogLine(
                  selected.creature,
                  adapter.statBlockForm.showPf2eBlock,
                )}
              </p>
            </button>
            <button type="button" className="btn btn-sm" onClick={toNpc}>
              To NPC
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!selected}
              onClick={() => {
                setSheetOpen(false);
                setEditor({ mode: 'clone', initial: selected.creature });
              }}
            >
              Clone
            </button>
            {selected.creature.origin === 'homebrew' && (
              <button
                type="button"
                className="btn btn-sm btn-on"
                onClick={() => {
                  setSheetOpen(false);
                  setEditor({ mode: 'edit', initial: selected.creature });
                }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm ${portraitOpen ? 'btn-on' : ''}`}
              onClick={() => setPortraitOpen((open) => !open)}
            >
              Portrait
            </button>
          </div>
          {portraitOpen && (
            <PortraitField
              size="sm"
              label={`Portrait · ${selected.creature.name}`}
              value={selected.creature.portraitDataUrl}
              onChange={(portraitDataUrl) => {
                void (async () => {
                  const saved = await setCreaturePortrait(
                    selected.creature.id,
                    portraitDataUrl,
                  );
                  if (!saved) return;
                  setRefreshKey((k) => k + 1);
                })();
              }}
            />
          )}
        </div>
      )}

      {sheetOpen && selected && (
        <Modal
          title={selected.creature.name}
          size="lg"
          onClose={() => setSheetOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSheetOpen(false);
                  toNpc();
                }}
              >
                To NPC
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSheetOpen(false);
                  setEditor({ mode: 'clone', initial: selected.creature });
                }}
              >
                Clone
              </button>
              {selected.creature.origin === 'homebrew' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setSheetOpen(false);
                    setEditor({ mode: 'edit', initial: selected.creature });
                  }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-accent"
                onClick={() => addCreature(selected.creature, quantity)}
              >
                +Combat
              </button>
            </>
          }
        >
          <div className="max-h-[70vh] overflow-auto">
            <StatBlockPreview
              block={selected.creature}
              form={adapter.statBlockForm}
              hideTitle
            />
          </div>
        </Modal>
      )}

      {editor && (
        <CreatureEditor
          system={campaign.system}
          campaignId={campaign.id}
          mode={editor.mode}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={(creature) => {
            pushLog(`Saved homebrew “${creature.name}”`, 'system');
            setSelectedId(creature.id);
            setRefreshKey((k) => k + 1);
            void refreshStats();
          }}
          onDeleted={(id) => {
            pushLog('Deleted homebrew creature', 'system');
            if (selectedId === id) setSelectedId(null);
            setRefreshKey((k) => k + 1);
            void refreshStats();
          }}
        />
      )}

      {npcDraft && (
        <NpcQuickEditor
          npc={npcDraft}
          onCancel={() => setNpcDraft(null)}
          onSave={(npc) => {
            upsertNpc(npc);
            pushLog(`NPC “${npc.name}” added to roster`, 'system');
            setNpcDraft(null);
          }}
        />
      )}
    </div>
  );
}
