import { useEffect, useState } from 'react';
import {
  addSpellRef,
  derivedSpellAttackBonus,
  derivedSpellSaveDc,
  extractPreparedSpellNames,
  extractSpellcastingHeader,
  groupSpellRefs,
  patchSpellcasting,
  removeSpellRef,
  resolveSpellRefMeta,
} from '../../lib/creature-spells';
import { formatEntryDamage } from '../../lib/damage-types';
import { actionCostGlyph } from '../../lib/pf2e-actions';
import {
  ABILITY_LABELS,
  ABILITY_NAMES,
  abilityKeys,
  formatModifier,
} from '../../lib/statblock-derived';
import {
  ensureSpellsSeeded,
  searchSpells,
  spellLevelLabel,
} from '../../lib/spells';
import type { Ability, Spell, StatBlock, StatBlockSpellRef } from '../../types';

export function CreatureSpellPicker({
  block,
  campaignId,
  traitText,
  onChange,
}: {
  block: StatBlock;
  campaignId?: string;
  /** Spellcasting trait text — used by Match catalog. */
  traitText?: string;
  onChange: (
    patch: Pick<StatBlock, 'spellRefs' | 'spellcasting'>,
  ) => void;
}) {
  const system = block.system;
  const value = block.spellRefs;
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Spell[]>([]);
  const [ready, setReady] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchNote, setMatchNote] = useState<string | null>(null);

  const ability = block.spellcasting?.ability;
  const derivedDc = ability ? derivedSpellSaveDc(block, ability) : null;
  const derivedHit = ability ? derivedSpellAttackBonus(block, ability) : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureSpellsSeeded();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const found = await searchSpells({
        system,
        campaignId,
        query: q,
      });
      if (!cancelled) {
        const attached = new Set((value ?? []).map((r) => r.id));
        setHits(
          found
            .map((r) => r.spell)
            .filter((s) => !attached.has(s.id))
            .slice(0, 8),
        );
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, system, campaignId, ready, value]);

  const patchCasting = (next: {
    ability?: Ability | '';
    saveDc?: number | '';
    attackBonus?: number | '';
  }) => {
    onChange({
      spellRefs: value,
      spellcasting: patchSpellcasting(block.spellcasting, next),
    });
  };

  const add = (spell: Spell) => {
    onChange({
      spellRefs: addSpellRef(value, spell),
      spellcasting: block.spellcasting,
    });
    setQuery('');
    setHits([]);
    setMatchNote(null);
  };

  const matchFromTrait = async () => {
    const names = extractPreparedSpellNames(traitText ?? '');
    const header = extractSpellcastingHeader(traitText ?? '');
    if (names.length === 0 && !header.ability && header.saveDc == null) {
      setMatchNote('No prepared-spell names found in Traits.');
      return;
    }
    setMatching(true);
    setMatchNote(null);
    try {
      await ensureSpellsSeeded();
      let next: StatBlockSpellRef[] = value ?? [];
      let added = 0;
      let missed = 0;
      for (const name of names) {
        const found = await searchSpells({
          system,
          campaignId,
          query: name,
        });
        const exact = found.find(
          (r) => r.spell.name.toLowerCase() === name.toLowerCase(),
        );
        if (!exact) {
          missed += 1;
          continue;
        }
        const before = next.length;
        next = addSpellRef(next, exact.spell);
        if (next.length > before) added += 1;
      }
      const spellcasting = block.spellcasting?.ability
        ? block.spellcasting
        : header.ability
          ? {
              ability: header.ability,
              ...(header.saveDc != null ? { saveDc: header.saveDc } : {}),
              ...(header.attackBonus != null
                ? { attackBonus: header.attackBonus }
                : {}),
            }
          : block.spellcasting;
      onChange({
        spellRefs: next.length > 0 ? next : undefined,
        spellcasting,
      });
      const bits: string[] = [];
      if (added > 0) bits.push(`Added ${added} from the Spellcasting trait`);
      if (header.ability && !block.spellcasting?.ability) {
        bits.push(`${ABILITY_NAMES[header.ability]} DC`);
      }
      if (missed > 0) {
        bits.push(
          `${missed} name${missed === 1 ? '' : 's'} not in the catalog`,
        );
      }
      setMatchNote(bits.join('. ') + (bits.length ? '.' : ''));
    } finally {
      setMatching(false);
    }
  };

  const namesInTraits = extractPreparedSpellNames(traitText ?? '').length;
  const traitHeader = extractSpellcastingHeader(traitText ?? '');
  const headerInTraits =
    traitHeader.ability != null || traitHeader.saveDc != null;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Spells
        </h3>
        {(namesInTraits > 0 || headerInTraits) && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={matching}
            onClick={() => void matchFromTrait()}
          >
            {matching ? 'Matching…' : 'Match catalog'}
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted">
        Save DC and attack sit at the top of this section. Click a name on the
        preview to read the full text.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs text-muted">
          Ability
          <select
            className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
            value={ability ?? ''}
            onChange={(e) =>
              patchCasting({ ability: (e.target.value || '') as Ability | '' })
            }
          >
            <option value="">—</option>
            {abilityKeys().map((ab) => (
              <option key={ab} value={ab}>
                {ABILITY_LABELS[ab]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Spell DC
          <input
            type="number"
            className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
            value={block.spellcasting?.saveDc ?? ''}
            placeholder={derivedDc != null ? String(derivedDc) : '—'}
            disabled={!ability}
            title={
              ability
                ? 'Leave blank to use 8 + PB + ability (PF2e: 10 + expert + ability)'
                : 'Pick an ability first'
            }
            onChange={(e) => {
              const raw = e.target.value;
              patchCasting({ saveDc: raw === '' ? '' : Number(raw) });
            }}
          />
        </label>
        <label className="block text-xs text-muted">
          Attack
          <input
            type="number"
            className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono-stats tabular-nums text-text"
            value={block.spellcasting?.attackBonus ?? ''}
            placeholder={derivedHit != null ? String(derivedHit) : '—'}
            disabled={!ability}
            title={
              ability
                ? 'Leave blank to use PB + ability (PF2e: level + 4 + ability)'
                : 'Pick an ability first'
            }
            onChange={(e) => {
              const raw = e.target.value;
              patchCasting({ attackBonus: raw === '' ? '' : Number(raw) });
            }}
          />
        </label>
      </div>
      {ability && derivedDc != null && derivedHit != null && (
        <p className="text-[11px] text-muted">
          Auto {derivedDc} DC, {formatModifier(derivedHit)} to hit. Type a
          number to override.
        </p>
      )}
      <div className="relative">
        <label className="block text-xs text-muted">
          Add from catalog
          <input
            className="mt-0.5 w-full rounded border border-border bg-panel-2 px-2 py-1 text-sm text-text"
            value={query}
            placeholder="Fireball, Shield, Heal…"
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-0.5 max-h-48 w-full overflow-auto rounded border border-border bg-panel shadow-lg">
            {hits.map((spell) => (
              <li key={spell.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-text hover:bg-panel-2"
                  onClick={() => add(spell)}
                >
                  <span className="min-w-0 flex-1 truncate">{spell.name}</span>
                  <span className="shrink-0 font-mono-stats text-[10px] text-muted">
                    {spellLevelLabel(spell)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {matchNote && <p className="text-[11px] text-muted">{matchNote}</p>}
      {(value?.length ?? 0) > 0 ? (
        <ul className="space-y-1.5 text-xs">
          {groupSpellRefs(value, system).map((group) => (
            <li key={group.level}>
              <span className="italic text-muted">{group.label}. </span>
              {group.spells.map((ref, i) => {
                const meta = resolveSpellRefMeta(ref);
                const dmg = formatEntryDamage(meta.damage);
                return (
                <span key={ref.id}>
                  {i > 0 && ', '}
                  {system === 'pf2e' && meta.actions != null && (
                    <span className="mr-0.5 font-mono-stats text-accent">
                      {actionCostGlyph(meta.actions)}
                    </span>
                  )}
                  <span className="text-text">{ref.name}</span>
                  {system === 'pf2e' && dmg && (
                    <span className="ml-1 font-mono-stats text-[10px] text-damage">
                      {dmg}
                    </span>
                  )}
                  <button
                    type="button"
                    className="ml-0.5 text-muted hover:text-damage"
                    aria-label={`Remove ${ref.name}`}
                    onClick={() =>
                      onChange({
                        spellRefs: removeSpellRef(value, ref.id),
                        spellcasting: block.spellcasting,
                      })
                    }
                  >
                    ×
                  </button>
                </span>
                );
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">None yet — search above to add.</p>
      )}
    </section>
  );
}
