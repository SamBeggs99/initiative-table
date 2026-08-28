import { useEffect, useMemo, useState } from 'react';
import { CampaignSettings } from './components/CampaignSettings';
import { BestiaryPanel } from './components/BestiaryPanel';
import { SpellsPanel } from './components/SpellsPanel';
import { NpcPanel } from './components/NpcPanel';
import { PartyPanel } from './components/PartyPanel';
import { InitiativeTracker } from './components/combat/InitiativeTracker';
import { CommandPalette } from './components/CommandPalette';
import { NotesPanel } from './components/NotesPanel';
import { TrackersPanel } from './components/TrackersPanel';
import { ToastHost } from './components/ToastHost';
import { promoteLogToSessionNotes } from './lib/session-notes';
import {
  BloomCluster,
  Sprig,
  SproutMark,
  VineRule,
} from './components/ornament/Botanical';
import { FirstCampaignWizard } from './components/FirstCampaignWizard';
import { DevGallery } from './components/DevGallery';
import { UndoBar } from './components/UndoBar';
import { CloudSyncGate } from './components/CloudSyncGate';
import { useCloudAuth } from './lib/cloud/auth-context';
import { BootScreen, LoginScreen } from './components/LoginScreen';
import { getSystemAdapter } from './systems';
import {
  selectActiveCampaign,
  selectActiveCombat,
  useStore,
} from './store';

type SessionMode = 'setup' | 'combat' | 'downtime';
type RosterSection = 'players' | 'npcs' | 'library' | 'notes';
type LibraryPane = 'creatures' | 'spells';

function deriveSessionMode(
  started: boolean,
  combatantCount: number,
  partyCount: number,
  hasEnemy: boolean,
): SessionMode {
  if (started) return 'combat';
  if (partyCount > 0 && (combatantCount === 0 || !hasEnemy)) return 'downtime';
  return 'setup';
}

function CampaignStrip({
  onNewCampaign,
}: {
  onNewCampaign: () => void;
}) {
  const campaigns = useStore((s) => s.campaigns);
  const activeCampaignId = useStore((s) => s.activeCampaignId);
  const setActiveCampaign = useStore((s) => s.setActiveCampaign);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const active = campaigns.find((c) => c.id === activeCampaignId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="rail header-vine flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <SproutMark />
          <span className="text-sm font-semibold tracking-wide text-text sm:whitespace-nowrap">
            Dungeon Master MultiTool
          </span>
        </div>
        <div className="hidden h-5 w-px bg-border sm:block" />
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="sr-only">Campaign</span>
          <select
            className="field max-w-48 py-1.5"
            value={activeCampaignId ?? ''}
            onChange={(e) => setActiveCampaign(e.target.value || null)}
          >
            <option value="">No campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({getSystemAdapter(c.system).label})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={onNewCampaign}>
          New campaign
        </button>
        {active && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AccountChip />
          <button
            type="button"
            className="btn btn-sm"
            title="Day / Night theme"
            onClick={() =>
              updateSettings({
                theme: settings.theme === 'night' ? 'day' : 'night',
              })
            }
          >
            {settings.theme === 'night' ? 'Night' : 'Day'}
          </button>
          {active && (
            <>
              <button
                type="button"
                className="btn btn-sm"
                title="Comfortable / Compact density"
                onClick={() =>
                  updateSettings({
                    density:
                      settings.density === 'compact' ? 'comfortable' : 'compact',
                  })
                }
              >
                {settings.density === 'compact' ? 'Compact' : 'Comfortable'}
              </button>
              <span className="badge-soft badge-accent hidden lg:inline-flex">
                {getSystemAdapter(active.system).label}
              </span>
              <span className="badge-soft hidden lg:inline-flex">
                Session {active.sessionNumber ?? 1}
              </span>
              {active.system === 'pf2e' && active.heroPoints != null && (
                <span className="badge-soft badge-condition hidden lg:inline-flex">
                  Hero {active.heroPoints}
                </span>
              )}
              <kbd className="chip hidden font-mono-stats text-[10px] lg:inline-flex">
                Ctrl+K
              </kbd>
            </>
          )}
        </div>
      </header>
      {settingsOpen && <CampaignSettings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function AccountChip() {
  const { configured, session, email, signOut } = useCloudAuth();
  if (!configured || !session) return null;
  return (
    <button
      type="button"
      className="btn btn-sm"
      title={email ? `Signed in as ${email}` : 'Sign out'}
      onClick={() => void signOut()}
    >
      Sign out
    </button>
  );
}

function LeftColumn({
  section,
  setSection,
  libraryPane,
  setLibraryPane,
  mode,
  collapsed,
  onExpand,
  onCollapse,
  onStartWizard,
}: {
  section: RosterSection;
  setSection: (s: RosterSection) => void;
  libraryPane: LibraryPane;
  setLibraryPane: (p: LibraryPane) => void;
  mode: SessionMode;
  collapsed: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onStartWizard: () => void;
}) {
  const active = useStore(selectActiveCampaign);
  const adapter = active ? getSystemAdapter(active.system) : null;

  if (collapsed) {
    return (
      <aside className="rail hidden min-h-0 w-12 flex-col items-center gap-2 border-r border-border py-3 md:flex">
        {(
          [
            ['players', 'P', 'Players'],
            ['npcs', 'N', 'NPCs'],
            ['library', 'L', 'Library'],
            ['notes', 'Nt', 'Notes'],
          ] as const
        ).map(([id, letter, title]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm ${section === id ? 'btn-accent' : 'btn-ghost'}`}
            title={title}
            onClick={() => {
              setSection(id);
              onExpand?.();
            }}
          >
            {letter}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="rail rail-vine rail-vine-left flex min-h-0 flex-col border-r border-border">
      <div className="header-vine panel-sprig relative border-b border-border px-3 py-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="section-title section-title-leaf">Campaign roster</div>
          <div className="flex items-center gap-1">
            <span className="badge-soft text-[10px] capitalize">{mode}</span>
            {onCollapse && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Collapse roster"
                onClick={onCollapse}
              >
                Hide
              </button>
            )}
          </div>
        </div>
        {active && (
          <div
            className="seg grid-cols-4"
            role="tablist"
            aria-label="Roster sections"
          >
            {(
              [
                ['players', 'Players', active.party.length],
                ['npcs', 'NPCs', active.npcs.length],
                ['library', 'Library', null],
                [
                  'notes',
                  'Notes',
                  (active.sessionNotes ?? []).length || null,
                ],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className="seg-item"
                onClick={() => setSection(id)}
              >
                {label}
                {count != null && (
                  <span className="ml-0.5 font-mono-stats tabular-nums opacity-70">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-auto p-3 text-sm">
        {!active || !adapter ? (
          <div className="flex flex-col items-center px-2 py-8 text-center">
            <BloomCluster />
            <p className="mt-3 text-muted">
              Create or select a campaign to manage players, NPCs, creatures, and
              notes.
            </p>
            <button
              type="button"
              className="btn btn-accent mt-3"
              onClick={onStartWizard}
            >
              Get started
            </button>
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col">
            {section === 'players' && (
              <>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-text">Players & characters</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Always tracked — they stay on the combat canvas even between
                    fights. Adjust live HP there or on this roster. Sheet max HP
                    stays under Edit sheet.
                  </p>
                </div>
                {adapter.resources.kind === 'focus-hero' && (
                  <p className="mb-2 text-xs text-condition">
                    Hero points: {active.heroPoints ?? 0}
                  </p>
                )}
                <PartyPanel />
              </>
            )}
            {section === 'npcs' && (
              <>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-text">NPC roster</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Recurring allies, rivals, and named creatures.
                  </p>
                </div>
                <NpcPanel />
              </>
            )}
            {section === 'library' && (
              <>
                <div
                  className="seg mb-3 grid-cols-2"
                  role="tablist"
                  aria-label="Library"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={libraryPane === 'creatures'}
                    className="seg-item"
                    onClick={() => setLibraryPane('creatures')}
                  >
                    Creatures
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={libraryPane === 'spells'}
                    className="seg-item"
                    onClick={() => setLibraryPane('spells')}
                  >
                    Spells
                  </button>
                </div>
                {libraryPane === 'creatures' ? <BestiaryPanel /> : <SpellsPanel />}
              </>
            )}
            {section === 'notes' && (
              <>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-text">Session notes</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    This session&apos;s beats plus pinned campaign notes you want
                    always on hand.
                  </p>
                </div>
                <NotesPanel />
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

function RightColumn() {
  const log = useStore((s) => s.log);
  const campaign = useStore(selectActiveCampaign);
  const upsertSessionNote = useStore((s) => s.upsertSessionNote);
  const pushToast = useStore((s) => s.pushToast);

  const promote = (entry: (typeof log)[number]) => {
    if (!campaign) return;
    const note = promoteLogToSessionNotes(
      campaign.sessionNotes ?? [],
      campaign.sessionNumber ?? 1,
      entry,
    );
    upsertSessionNote(note);
    pushToast('Pinned to Notes (left roster)');
  };

  return (
    <aside className="rail rail-vine rail-vine-right flex min-h-0 flex-col border-l border-border">
      <div className="header-vine panel-sprig relative border-b border-border px-3 py-3">
        <div className="section-title section-title-leaf">Trackers</div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <TrackersPanel />
        <section className="flex min-h-40 shrink-0 flex-col p-3">
          <h2 className="section-title section-title-leaf mb-1">Session log</h2>
          <VineRule className="mb-2" />
          <div className="min-h-0 flex-1 overflow-auto font-mono-stats text-[11px] tabular-nums">
            {log.length === 0 ? (
              <div className="flex items-center gap-2 text-muted">
                <Sprig />
                <p>No events yet.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {[...log].reverse().map((entry) => (
                  <li
                    key={entry.id}
                    className="group flex items-start gap-1 rounded px-1.5 py-0.5 text-muted transition-colors hover:bg-panel-2 hover:text-text"
                  >
                    <span className="min-w-0 flex-1">{entry.message}</span>
                    {campaign && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm shrink-0 opacity-0 group-hover:opacity-100"
                        title="Pin to session notes"
                        onClick={() => promote(entry)}
                      >
                        +
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

export default function App() {
  const [gallery, setGallery] = useState(
    () => window.location.hash === '#/dev/gallery',
  );
  const { configured, ready, session } = useCloudAuth();

  useEffect(() => {
    const onHash = () => setGallery(window.location.hash === '#/dev/gallery');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (gallery) {
    return (
      <DevGallery
        onBack={() => {
          window.location.hash = '';
          setGallery(false);
        }}
      />
    );
  }

  if (configured && !ready) {
    return <BootScreen message="Signing in…" />;
  }
  if (configured && !session) {
    return <LoginScreen />;
  }

  return (
    <CloudSyncGate>
      <TableApp />
    </CloudSyncGate>
  );
}

function TableApp() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [section, setSection] = useState<RosterSection>('players');
  const [libraryPane, setLibraryPane] = useState<LibraryPane>('creatures');
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardForced, setWizardForced] = useState(false);
  const combat = useStore(selectActiveCombat);
  const campaign = useStore(selectActiveCampaign);
  const campaigns = useStore((s) => s.campaigns);
  const settings = useStore((s) => s.settings);
  const sharedScreen = settings.sharedScreen;

  // First launch: no campaigns and wizard not finished/skipped.
  // Runs after cloud hydrate (this tree only mounts once the gate is ready).
  useEffect(() => {
    if (campaigns.length === 0 && !settings.onboardingComplete) {
      setWizardOpen(true);
      setWizardForced(false);
    }
  }, [campaigns.length, settings.onboardingComplete]);

  const openNewCampaignWizard = () => {
    setWizardForced(true);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardForced(false);
  };

  const hasEnemy = useMemo(
    () => combat.combatants.some((c) => c.kind !== 'pc'),
    [combat.combatants],
  );

  const mode = deriveSessionMode(
    combat.started,
    combat.combatants.length,
    campaign?.party.length ?? 0,
    hasEnemy,
  );

  useEffect(() => {
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.shared = sharedScreen ? 'true' : 'false';
  }, [settings.density, settings.theme, sharedScreen]);

  // Session-mode emphasis: combat → library creatures; downtime → players.
  useEffect(() => {
    if (mode === 'combat' || (mode === 'setup' && (campaign?.party.length ?? 0) > 0)) {
      setSection((s) => (s === 'players' ? 'library' : s));
    } else if (mode === 'downtime') {
      setSection((s) => (s === 'library' ? 'players' : s));
    }
  }, [mode, campaign?.party.length]);

  useEffect(() => {
    if (mode !== 'combat') setRosterExpanded(false);
  }, [mode]);

  const openCreatureSearch = () => {
    setSection('library');
    setLibraryPane('creatures');
    setRosterExpanded(true);
    window.setTimeout(() => {
      document.getElementById('bestiary-search')?.focus();
    }, 50);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rosterCollapsed = mode === 'combat' && !rosterExpanded;
  const gridClass = sharedScreen
    ? 'grid min-h-0 flex-1 grid-cols-1'
    : rosterCollapsed
      ? 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(32rem,1fr)_minmax(36rem,1fr)] overflow-y-auto md:grid-cols-[3rem_1fr_minmax(14rem,18rem)] md:grid-rows-1 md:overflow-hidden'
      : mode === 'combat'
        ? 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(32rem,1fr)_minmax(36rem,1fr)] overflow-y-auto md:grid-cols-[minmax(14rem,18rem)_1fr_minmax(14rem,18rem)] md:grid-rows-1 md:overflow-hidden'
        : 'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(24rem,1fr)_minmax(32rem,1fr)_minmax(36rem,1fr)] overflow-y-auto md:grid-cols-[minmax(14rem,18rem)_1fr_minmax(14rem,18rem)] md:grid-rows-1 md:overflow-hidden';

  return (
    <div className="flex h-full flex-col">
      <CampaignStrip onNewCampaign={openNewCampaignWizard} />
      <div className={gridClass}>
        {!sharedScreen && (
          <LeftColumn
            section={section}
            setSection={setSection}
            libraryPane={libraryPane}
            setLibraryPane={setLibraryPane}
            mode={mode}
            collapsed={rosterCollapsed}
            onExpand={() => setRosterExpanded(true)}
            onCollapse={rosterCollapsed ? undefined : mode === 'combat' ? () => setRosterExpanded(false) : undefined}
            onStartWizard={openNewCampaignWizard}
          />
        )}
        <InitiativeTracker
          onFocusSearch={openCreatureSearch}
          onOpenBestiary={openCreatureSearch}
        />
        {!sharedScreen && <RightColumn />}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastHost />
      <UndoBar />
      {wizardOpen && (
        <FirstCampaignWizard
          forceOpen={wizardForced}
          onClose={closeWizard}
        />
      )}
    </div>
  );
}
