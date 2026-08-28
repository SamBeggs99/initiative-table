import { useEffect, useMemo, useRef, useState } from 'react';
import { getCreatureById, searchCreatures } from '../lib/bestiary';
import { getSpellById, searchSpells } from '../lib/spells';
import {
  executePaletteIntent,
  parsePaletteInput,
  type PaletteContext,
  type PaletteIntent,
} from '../lib/palette';
import { getSystemAdapter } from '../systems';
import { selectActiveCampaign, selectActiveCombat, useStore } from '../store';
import type { Spell, StatBlock } from '../types';
import { StatBlockPreview } from './statblock/StatBlockPreview';
import { SpellPreview } from './spells/SpellPreview';

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [creatures, setCreatures] = useState<{ id: string; name: string }[]>([]);
  const [spells, setSpells] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [previewBlock, setPreviewBlock] = useState<StatBlock | null>(null);
  const [previewSpell, setPreviewSpell] = useState<Spell | null>(null);

  const campaign = useStore(selectActiveCampaign);
  const combat = useStore(selectActiveCombat);
  const system = campaign?.system ?? 'dnd5e';
  const campaignId = campaign?.id;
  const form = getSystemAdapter(system).statBlockForm;

  const ctx: PaletteContext = useMemo(
    () => ({
      combatants: combat.combatants,
      party: campaign?.party ?? [],
      npcs: campaign?.npcs ?? [],
      trackers: campaign?.trackers ?? [],
      creatures,
      spells,
    }),
    [combat.combatants, campaign, creatures, spells],
  );

  const intent: PaletteIntent = useMemo(
    () => parsePaletteInput(text, ctx),
    [text, ctx],
  );

  useEffect(() => {
    if (!open) return;
    setText('');
    setStatus(null);
    setPreviewBlock(null);
    setPreviewSpell(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const creatureQuery =
    intent.type === 'add-creatures'
      ? intent.query
      : (text.trim().match(/^\d+\s+(.+)$/)?.[1] ??
        (text.trim().includes(' ') ? '' : text.trim()));
  const spellQuery =
    intent.type === 'open-spell'
      ? intent.query
      : /^spell(?:s)?\s+/i.test(text)
        ? text.trim().replace(/^spell(?:s)?\s+/i, '').trim()
        : '';

  // Async creature fuzzy for add / bare-name intents
  useEffect(() => {
    if (!open || !campaignId) {
      setCreatures((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (!creatureQuery) {
      setCreatures((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const hits = await searchCreatures({
        system,
        campaignId,
        query: creatureQuery,
      });
      if (cancelled) return;
      const next = hits.slice(0, 8).map((h) => ({
        id: h.creature.id,
        name: h.creature.name,
      }));
      setCreatures((prev) =>
        prev.length === next.length && prev.every((c, i) => c.id === next[i]?.id)
          ? prev
          : next,
      );
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, campaignId, system, creatureQuery]);

  useEffect(() => {
    if (!open || !campaignId || !spellQuery) {
      setSpells((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const hits = await searchSpells({
        system,
        campaignId,
        query: spellQuery,
      });
      if (cancelled) return;
      const next = hits.slice(0, 8).map((h) => ({ id: h.spell.id, name: h.spell.name }));
      setSpells((prev) =>
        prev.length === next.length && prev.every((s, i) => s.id === next[i]?.id)
          ? prev
          : next,
      );
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, campaignId, system, spellQuery]);

  const run = async () => {
    const store = useStore.getState();
    const result = await executePaletteIntent(intent, store);
    setStatus(result.message);
    if (result.openStatBlock) {
      const { source, id } = result.openStatBlock;
      if (source === 'creature') {
        const block = await getCreatureById(id);
        setPreviewBlock(block ?? null);
      } else if (source === 'combatant') {
        const c = store.getActiveCombat().combatants.find((x) => x.id === id);
        setPreviewBlock(c?.statBlock ?? null);
      } else if (source === 'npc') {
        const npc = store.getActiveCampaign()?.npcs.find((n) => n.id === id);
        setPreviewBlock(npc?.statBlock ?? null);
        if (!npc?.statBlock) {
          setStatus(`${result.message} — no stat block on this NPC yet`);
        }
      }
      return;
    }
    if (result.openSpell) {
      const spell = await getSpellById(result.openSpell.id);
      setPreviewSpell(spell ?? null);
      setPreviewBlock(null);
      if (!spell) setStatus(`${result.message} — spell not in catalog`);
      return;
    }
    if (result.ok) onClose();
  };

  if (!open) return null;

  const suggestions =
    intent.type === 'unknown' || intent.type === 'ambiguous'
      ? intent.suggestions
      : intent.type === 'open-spell'
        ? spells.map((s) => s.name)
        : creatures.map((c) => c.name);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="border-b border-border px-3 py-2.5">
          <input
            ref={inputRef}
            className="w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
            placeholder="4 goblins · spell fireball · dmg kael 14 · next"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setStatus(null);
              setPreviewBlock(null);
              setPreviewSpell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void run();
              }
            }}
          />
        </div>

        <div className="border-b border-border bg-surface/50 px-3 py-2 text-sm">
          <span className="section-title mr-1">Preview</span>
          <span
            className={
              intent.runnable ? 'text-accent' : 'text-muted'
            }
          >
            {intent.preview}
          </span>
          {status && (
            <p className="mt-1 text-xs text-muted">{status}</p>
          )}
        </div>

        {suggestions.length > 0 && (
          <ul className="max-h-40 overflow-auto px-1 py-1 text-sm">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-muted hover:bg-panel-2 hover:text-text"
                  onClick={() => {
                    // If it's a creature name suggestion for add, fill it
                    if (intent.type === 'add-creatures' && /^\d+\s+/.test(text)) {
                      const qty = text.match(/^(\d+)/)?.[1] ?? '1';
                      setText(`${qty} ${s}`);
                    } else if (s.startsWith('Add') || s.startsWith('Open') || s.startsWith('Deal')) {
                      /* ambiguous previews — ignore fill */
                    } else {
                      setText(s);
                    }
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        {previewSpell && (
          <div className="max-h-64 overflow-auto border-t border-border p-2">
            <SpellPreview spell={previewSpell} />
          </div>
        )}

        {previewBlock && (
          <div className="max-h-64 overflow-auto border-t border-border p-2">
            <StatBlockPreview block={previewBlock} form={form} />
          </div>
        )}

        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted">
          Enter runs · Esc closes · Ctrl+K · actions go through the store
        </div>
      </div>
    </div>
  );
}
