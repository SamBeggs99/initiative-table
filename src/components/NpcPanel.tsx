import { useMemo, useState, type CSSProperties } from 'react';
import { hueHex, npcHueId } from '../lib/identity';
import {
  blankCharacterNpc,
  importNpcJson,
  npcFromPaste,
  npcFromStatBlock,
  searchNpcs,
  woundedLabel,
} from '../lib/npc';
import { blankStatBlock } from '../lib/statblock-derived';
import { useStore } from '../store';
import type { Entry, NpcRecord, StatBlock } from '../types';
import { ConfirmDialog } from './ui/AskDialog';
import { PortraitField, PortraitThumb } from './ui/Portrait';

type CreateMode = 'paste' | 'json' | 'manual-character' | 'manual-statted' | null;

function tagsFromInput(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function NpcQuickEditor({
  npc,
  onSave,
  onCancel,
  review,
}: {
  npc: NpcRecord;
  onSave: (npc: NpcRecord) => void;
  onCancel: () => void;
  review?: { unparsed: string[]; confidenceNotes: string[]; warnings: string[] };
}) {
  const [draft, setDraft] = useState<NpcRecord>(() => structuredClone(npc));
  const [tagText, setTagText] = useState(npc.tags.join(', '));

  const patch = (p: Partial<NpcRecord>) => setDraft((d) => ({ ...d, ...p }));
  const patchBlock = (p: Partial<StatBlock>) =>
    setDraft((d) =>
      d.statBlock ? { ...d, statBlock: { ...d.statBlock, ...p } } : d,
    );

  const setHp = (current: number, max: number) => {
    patch({
      persistentHp: { current: Math.max(0, current), max: Math.max(1, max) },
    });
    if (draft.statBlock) {
      patchBlock({ hpAvg: Math.max(1, max) });
    }
  };

  const actions = draft.statBlock?.actions ?? [];
  const setActions = (next: Entry[]) => patchBlock({ actions: next });

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-4 w-full max-w-lg card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">
            {npc.id === draft.id && npc.name ? 'Edit NPC' : 'New NPC'}
          </h3>
          <button
            type="button"
            className="text-xs text-muted hover:text-text"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        {review &&
          (review.unparsed.length > 0 ||
            review.confidenceNotes.length > 0 ||
            review.warnings.length > 0) && (
            <div className="mb-3 space-y-1 rounded border border-condition/40 bg-panel-2 p-2 text-xs text-condition">
              <p className="font-semibold">Review — incomplete parse</p>
              {review.confidenceNotes.map((n) => (
                <p key={n}>{n}</p>
              ))}
              {review.warnings.map((n) => (
                <p key={n}>{n}</p>
              ))}
              {review.unparsed.length > 0 && (
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
                  {review.unparsed.join('\n')}
                </pre>
              )}
            </div>
          )}

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted">Name</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1.5 text-text"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              autoFocus
            />
          </label>

          <PortraitField
            value={draft.portraitDataUrl}
            onChange={(portraitDataUrl) => {
              setDraft((d) => ({
                ...d,
                portraitDataUrl,
                statBlock: d.statBlock
                  ? { ...d.statBlock, portraitDataUrl }
                  : d.statBlock,
              }));
            }}
          />

          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded bg-border/50 px-2 py-0.5 text-muted">
              {draft.kind}
            </span>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={draft.writeBackHp !== false && draft.kind === 'statted'}
                disabled={draft.kind !== 'statted'}
                onChange={(e) => patch({ writeBackHp: e.target.checked })}
              />
              Persistent HP (write back on combat end)
            </label>
          </div>

          {draft.kind === 'statted' && draft.statBlock && (
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-xs text-muted">AC</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                  value={draft.statBlock.ac}
                  onChange={(e) => patchBlock({ ac: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">HP current</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                  value={draft.persistentHp?.current ?? draft.statBlock.hpAvg}
                  onChange={(e) =>
                    setHp(
                      Number(e.target.value) || 0,
                      draft.persistentHp?.max ?? draft.statBlock!.hpAvg,
                    )
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">HP max</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
                  value={draft.persistentHp?.max ?? draft.statBlock.hpAvg}
                  onChange={(e) =>
                    setHp(
                      draft.persistentHp?.current ?? draft.statBlock!.hpAvg,
                      Number(e.target.value) || 1,
                    )
                  }
                />
              </label>
            </div>
          )}

          {draft.kind === 'character' && (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['role', 'Role'],
                  ['faction', 'Faction'],
                  ['location', 'Location'],
                  ['voice', 'Voice'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs text-muted">{label}</span>
                  <input
                    className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                    value={draft[key] ?? ''}
                    onChange={(e) => patch({ [key]: e.target.value || undefined })}
                  />
                </label>
              ))}
              <label className="col-span-2 block">
                <span className="text-xs text-muted">Wants</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                  value={draft.wants ?? ''}
                  onChange={(e) => patch({ wants: e.target.value || undefined })}
                />
              </label>
              <label className="col-span-2 block">
                <span className="text-xs text-muted">Secret</span>
                <input
                  className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
                  value={draft.secret ?? ''}
                  onChange={(e) => patch({ secret: e.target.value || undefined })}
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs text-muted">Tags (comma-separated)</span>
            <input
              className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">Notes</span>
            <textarea
              className="mt-0.5 min-h-[72px] w-full rounded border border-border bg-panel-2 px-2 py-1 text-text"
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>

          {draft.kind === 'statted' && draft.statBlock && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-muted">Actions</span>
                <button
                  type="button"
                  className="text-[11px] text-accent"
                  onClick={() =>
                    setActions([...actions, { name: 'New action', desc: '' }])
                  }
                >
                  + Add
                </button>
              </div>
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className="space-y-1 rounded border border-border p-2">
                    <input
                      className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text"
                      value={a.name}
                      onChange={(e) => {
                        const next = [...actions];
                        next[i] = { ...a, name: e.target.value };
                        setActions(next);
                      }}
                    />
                    <textarea
                      className="min-h-[48px] w-full rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text"
                      value={a.desc}
                      onChange={(e) => {
                        const next = [...actions];
                        next[i] = { ...a, desc: e.target.value };
                        setActions(next);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onSave({
                ...draft,
                name: draft.name.trim() || 'Unnamed',
                tags: tagsFromInput(tagText),
                writeBackHp:
                  draft.kind === 'statted' ? draft.writeBackHp !== false : false,
              })
            }
          >
            Save to roster
          </button>
        </div>
      </div>
    </div>
  );
}

function IntakeModal({
  mode,
  system,
  campaignId,
  onClose,
  onReady,
}: {
  mode: Exclude<CreateMode, null>;
  system: 'dnd5e' | 'pf2e';
  campaignId: string;
  onClose: () => void;
  onReady: (
    npc: NpcRecord,
    review?: { unparsed: string[]; confidenceNotes: string[]; warnings: string[] },
  ) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (mode === 'manual-character') {
    return (
      <NpcQuickEditor
        npc={blankCharacterNpc('')}
        onCancel={onClose}
        onSave={(npc) => onReady(npc)}
      />
    );
  }

  if (mode === 'manual-statted') {
    const block = blankStatBlock(system, { campaignId });
    block.name = '';
    return (
      <NpcQuickEditor
        npc={npcFromStatBlock(block)}
        onCancel={onClose}
        onSave={(npc) => onReady(npc)}
      />
    );
  }

  const title = mode === 'paste' ? 'Paste stat block' : 'Import JSON';
  const placeholder =
    mode === 'paste'
      ? 'Paste a 5e stat block…'
      : 'Paste NpcRecord, StatBlock, or Open5e JSON…';

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="my-4 w-full max-w-lg card p-4 shadow-2xl">
        <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
        <textarea
          className="min-h-[200px] w-full rounded border border-border bg-panel-2 px-2 py-1.5 font-mono text-xs text-text"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-damage">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              if (mode === 'paste') {
                const { npc, unparsed, confidenceNotes } = npcFromPaste(text);
                onReady(npc, { unparsed, confidenceNotes, warnings: [] });
                return;
              }
              const result = importNpcJson(text);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onReady(result.npc, {
                unparsed: [],
                confidenceNotes: [],
                warnings: result.warnings,
              });
            }}
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}

export function NpcPanel() {
  const campaign = useStore((s) =>
    s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null,
  );
  const upsertNpc = useStore((s) => s.upsertNpc);
  const deleteNpc = useStore((s) => s.deleteNpc);
  const addNpcToCombat = useStore((s) => s.addNpcToCombat);

  const [query, setQuery] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [editing, setEditing] = useState<{
    npc: NpcRecord;
    review?: { unparsed: string[]; confidenceNotes: string[]; warnings: string[] };
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const results = useMemo(
    () => (campaign ? searchNpcs(campaign.npcs, query) : []),
    [campaign, query],
  );

  if (!campaign) return null;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn"
          onClick={() => setCreateMode('paste')}
        >
          Paste
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setCreateMode('json')}
        >
          Import JSON
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setCreateMode('manual-character')}
        >
          Character
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setCreateMode('manual-statted')}
        >
          Manual stats
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Clone from bestiary: select a creature → To NPC
      </p>

      <label className="block">
        <span className="sr-only">Search NPCs</span>
        <input
          className="w-full rounded border border-border bg-panel-2 px-2 py-1.5 text-sm text-text"
          placeholder="Search name, faction, location, tags, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <ul className="max-h-48 min-h-0 space-y-0.5 overflow-auto text-sm">
        {results.length === 0 ? (
          <li className="text-muted">
            {campaign.npcs.length === 0 ? 'No NPCs yet.' : 'No matches.'}
          </li>
        ) : (
          results.map((npc) => {
            const wound = woundedLabel(npc);
            return (
              <li key={npc.id}>
                <div
                  className="flex items-start gap-1 rounded px-1 py-1 hover:bg-panel-2"
                  style={
                    {
                      '--identity': hueHex(npcHueId(npc.id || npc.name)),
                    } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditing({ npc })}
                  >
                    <div className="flex items-center gap-2">
                      {npc.portraitDataUrl || npc.statBlock?.portraitDataUrl ? (
                        <PortraitThumb
                          src={npc.portraitDataUrl ?? npc.statBlock?.portraitDataUrl}
                          alt=""
                          size="xs"
                        />
                      ) : (
                        <span className="identity-dot" aria-hidden />
                      )}
                      <span className="name-identity truncate font-medium">
                        {npc.name}
                      </span>
                      <span className="shrink-0 rounded bg-border/50 px-1 text-[10px] text-muted">
                        {npc.kind === 'statted' ? 'stats' : 'char'}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {[npc.faction, npc.location, wound].filter(Boolean).join(' · ') ||
                        (npc.persistentHp
                          ? `${npc.persistentHp.current}/${npc.persistentHp.max} HP`
                          : npc.tags.slice(0, 3).join(', '))}
                    </div>
                  </button>
                  <button
                    type="button"
                    title="Add to combat"
                    className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-accent"
                    onClick={() => addNpcToCombat(npc.id)}
                  >
                    Combat
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-damage"
                    onClick={() => setPendingDeleteId(npc.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {createMode && (
        <IntakeModal
          mode={createMode}
          system={campaign.system}
          campaignId={campaign.id}
          onClose={() => setCreateMode(null)}
          onReady={(npc, review) => {
            setCreateMode(null);
            setEditing({ npc, review });
          }}
        />
      )}

      {editing && (
        <NpcQuickEditor
          npc={editing.npc}
          review={editing.review}
          onCancel={() => setEditing(null)}
          onSave={(npc) => {
            upsertNpc(npc);
            setEditing(null);
          }}
        />
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete NPC?"
          message={`Delete ${
            campaign.npcs.find((n) => n.id === pendingDeleteId)?.name ?? 'this NPC'
          }?`}
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            deleteNpc(pendingDeleteId);
            setPendingDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
