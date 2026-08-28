import { useEffect, useState } from 'react';
import { getSpellById, getSpellsByIds } from '../../lib/spells';
import {
  formatSpellcastingLine,
  groupSpellRefs,
  resolveSpellRefMeta,
  resolveSpellcasting,
} from '../../lib/creature-spells';
import { formatEntryDamage } from '../../lib/damage-types';
import { actionCostGlyph, actionCostLabel } from '../../lib/pf2e-actions';
import type { Spell, StatBlock } from '../../types';
import { SpellPreview } from '../spells/SpellPreview';

export function CreatureSpellList({ block }: { block: StatBlock }) {
  const groups = groupSpellRefs(block.spellRefs, block.system);
  const casting = resolveSpellcasting(block);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openSpell, setOpenSpell] = useState<Spell | null>(null);
  const [catalog, setCatalog] = useState<Map<string, Spell>>(new Map());
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    const ids = (block.spellRefs ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setCatalog(new Map());
      setCatalogReady(true);
      return;
    }
    setCatalogReady(false);
    let cancelled = false;
    void (async () => {
      const found = await getSpellsByIds(ids);
      if (cancelled) return;
      setCatalog(new Map(found.map((s) => [s.id, s])));
      setCatalogReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [block.spellRefs]);

  useEffect(() => {
    if (!openId) {
      setOpenSpell(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const spell = await getSpellById(openId);
      if (!cancelled) setOpenSpell(spell ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [openId]);

  if (groups.length === 0 && !casting) return null;

  return (
    <section className="mt-3">
      <h4 className="border-b border-border text-xs font-semibold uppercase tracking-wider text-accent">
        Spells
      </h4>
      {casting ? (
        <p className="mt-1.5 text-sm text-text">
          <span className="font-semibold italic">Spellcasting.</span>{' '}
          <span className="font-mono-stats tabular-nums text-text">
            {formatSpellcastingLine(casting, block.system)}
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted">
          Set a spellcasting ability to show save DC and attack bonus.
        </p>
      )}
      {groups.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {groups.map((group) => (
            <li key={group.level} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className="shrink-0 font-semibold italic text-text">
                {group.label}.
              </span>
              {group.spells.map((ref, i) => {
                const lost = catalogReady && !catalog.has(ref.id);
                const meta = resolveSpellRefMeta(ref, catalog.get(ref.id));
                const dmg = formatEntryDamage(meta.damage);
                const showPf2e = block.system === 'pf2e';
                return (
                  <span key={ref.id} className="inline-flex items-baseline gap-x-1">
                    {i > 0 && <span className="text-muted">·</span>}
                    {showPf2e && meta.actions != null && (
                      <span
                        className="font-mono-stats text-accent"
                        title={actionCostLabel(meta.actions)}
                        aria-label={actionCostLabel(meta.actions)}
                      >
                        {actionCostGlyph(meta.actions)}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`rounded px-0.5 text-left ${
                        openId === ref.id
                          ? 'bg-accent/15 text-accent'
                          : lost
                            ? 'text-muted line-through'
                            : 'text-text hover:text-accent'
                      }`}
                      title={
                        lost
                          ? 'Not in the spell catalog'
                          : `${ref.name} — click to view`
                      }
                      onClick={() =>
                        setOpenId((id) => (id === ref.id ? null : ref.id))
                      }
                    >
                      {ref.name}
                    </button>
                    {showPf2e && dmg && (
                      <span className="font-mono-stats text-[11px] tabular-nums text-damage">
                        {dmg}
                      </span>
                    )}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      )}
      {openId && openSpell && (
        <div className="mt-2">
          <SpellPreview spell={openSpell} />
        </div>
      )}
      {openId && !openSpell && catalogReady && !catalog.has(openId) && (
        <p className="mt-2 text-[11px] text-muted">
          That spell is not in the catalog. Sync spells or add it as homebrew.
        </p>
      )}
    </section>
  );
}
