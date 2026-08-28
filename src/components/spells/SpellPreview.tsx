import { actionCostGlyph } from '../../lib/pf2e-actions';
import { spellLevelLabel } from '../../lib/spells';
import type { Spell } from '../../types';

export function SpellPreview({
  spell,
  hideTitle = false,
}: {
  spell: Spell;
  hideTitle?: boolean;
}) {
  const traditions = spell.pf2e?.traditions?.length
    ? spell.pf2e.traditions
    : spell.classes;
  const traits = spell.pf2e?.traits ?? [];
  const cost = spell.pf2e?.actions;

  return (
    <article className="overflow-auto rounded border border-border bg-panel-2 p-3 text-sm">
      <header>
        {!hideTitle && (
          <h3 className="text-lg font-semibold text-accent">{spell.name}</h3>
        )}
        <p className="text-xs italic text-muted">
          {spellLevelLabel(spell)} {spell.school}
          {spell.ritual ? ' (ritual)' : ''}
          {spell.concentration ? ' · concentration' : ''}
        </p>
        {traits.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">{traits.join(' · ')}</p>
        )}
      </header>

      <dl className="mt-2 space-y-0.5 font-mono-stats text-xs tabular-nums">
        <div>
          <span className="text-muted">Casting </span>
          <span className="text-text">
            {cost != null && (
              <span className="mr-1 text-accent" title={`${cost} action`}>
                {actionCostGlyph(cost)}
              </span>
            )}
            {spell.castingTime}
          </span>
        </div>
        <div>
          <span className="text-muted">Range </span>
          <span className="text-text">{spell.range || '—'}</span>
        </div>
        {spell.components && (
          <div>
            <span className="text-muted">Components </span>
            <span className="text-text">{spell.components}</span>
          </div>
        )}
        <div>
          <span className="text-muted">Duration </span>
          <span className="text-text">{spell.duration || '—'}</span>
        </div>
        {traditions.length > 0 && (
          <div>
            <span className="text-muted">
              {spell.system === 'pf2e' ? 'Traditions ' : 'Lists '}
            </span>
            <span className="text-text">{traditions.join(', ')}</span>
          </div>
        )}
      </dl>

      <p className="mt-3 whitespace-pre-wrap text-sm text-text">{spell.desc}</p>
      {(spell.higherLevel || spell.pf2e?.heighten) && (
        <p className="mt-2 text-sm text-muted">
          <span className="font-semibold text-text">
            {spell.system === 'pf2e' ? 'Heightened. ' : 'At Higher Levels. '}
          </span>
          {spell.higherLevel || spell.pf2e?.heighten}
        </p>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-wider text-muted">
        {spell.source}
      </p>
    </article>
  );
}
