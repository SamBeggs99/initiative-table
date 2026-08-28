import {
  ABILITY_LABELS,
  abilityBonusOf,
  formatAbilityScore,
  formatModifier,
  proficiencyBonusFromCr,
} from '../../lib/statblock-derived';
import { formatEntryDamage } from '../../lib/damage-types';
import { formatEntryOffense } from '../../lib/parse';
import {
  actionCostGlyph,
  actionCostLabel,
  resolveActionCost,
  type ActionCost,
} from '../../lib/pf2e-actions';
import type { StatBlockFormModel } from '../../systems';
import type { Ability, Entry, StatBlock } from '../../types';
import { canonicalSkillName } from '../../lib/statblock-skills';
import { AbilityBonusNudge } from './AbilityBonusNudge';
import { DefenseTraitRow } from './DefenseTraitChips';
import { CreatureSpellList } from './CreatureSpellList';

function EntryBlock({
  title,
  entries,
  actionCosts,
  showActionCosts,
  live,
}: {
  title: string;
  entries: Entry[];
  actionCosts?: Record<string, ActionCost>;
  showActionCosts?: boolean;
  live?: {
    remaining: number;
    onUse: (entry: Entry, cost: ActionCost) => void;
  };
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="border-b border-border text-xs font-semibold uppercase tracking-wider text-accent">
        {title}
      </h4>
      <ul className="mt-1 space-y-2 text-sm">
        {entries.map((e) => {
          const cost = showActionCosts
            ? resolveActionCost(actionCosts, e.name)
            : 1;
          const spend =
            !showActionCosts ||
            cost === 'reaction' ||
            cost === 'free'
              ? 0
              : cost;
          const tooExpensive =
            live != null && showActionCosts && spend > 0 && live.remaining < spend;
          const dmg = formatEntryDamage(e.damage);
          const offense = formatEntryOffense(e);
          const req = e.requirements?.trim();
          const time = e.duration?.trim();
          const canUse = live != null && (showActionCosts || Boolean(e.damage));

          return (
            <li key={`${title}-${e.name}`} className="flex gap-2">
              {showActionCosts && (
                <span
                  className="mt-0.5 shrink-0 font-mono-stats text-accent"
                  title={actionCostLabel(cost)}
                  aria-label={actionCostLabel(cost)}
                >
                  {actionCostGlyph(cost)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span className="font-semibold italic text-text">{e.name}.</span>
                {offense && (
                  <span className="ml-1.5 font-mono-stats text-[11px] tabular-nums text-text">
                    {offense}
                  </span>
                )}
                {dmg && (
                  <span className="ml-1.5 font-mono-stats text-[11px] tabular-nums text-damage">
                    {dmg}
                  </span>
                )}{' '}
                {time && (
                  <span className="text-[11px] text-amber">
                    <span className="font-semibold not-italic">Time</span> {time}{' '}
                  </span>
                )}
                {req && (
                  <span className="text-[11px] text-amber">
                    <span className="font-semibold not-italic">Requirements</span>{' '}
                    {req}{' '}
                  </span>
                )}
                <span className="text-muted">{e.desc}</span>
                {canUse && (
                  <button
                    type="button"
                    className="btn btn-sm btn-text ml-2 align-middle"
                    disabled={tooExpensive}
                    title={
                      tooExpensive
                        ? `Need ${spend} actions (${live.remaining} left)`
                        : showActionCosts
                          ? `Spend ${actionCostLabel(cost)}${dmg ? ` · roll ${dmg}` : ''}`
                          : dmg
                            ? `Roll ${dmg} (applies to selection)`
                            : 'Use'
                    }
                    onClick={() => live.onUse(e, cost)}
                  >
                    Use
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Level/CR and source (with page when present) for the creature sheet header. */
export function creatureCatalogLine(
  block: StatBlock,
  showPf2eBlock: boolean,
): string {
  const rank = showPf2eBlock
    ? `Level ${block.pf2e?.level ?? block.cr}`
    : `CR ${block.cr}`;
  const source = block.source.trim();
  return source ? `${rank} · ${source}` : rank;
}

export function StatBlockPreview({
  block,
  form,
  liveActions,
  onAbilityBonus,
  hideTitle = false,
}: {
  block: StatBlock;
  form: StatBlockFormModel;
  /** When set (combat modal), Use spends the action pool and/or rolls damage. */
  liveActions?: {
    remaining: number;
    onUse: (entry: Entry, cost: ActionCost) => void;
  };
  /** Manual +1/−1 under each ability — printed score stays. */
  onAbilityBonus?: (ability: Ability, delta: number) => void;
  hideTitle?: boolean;
}) {
  const abs = block.abilities;
  const pb = proficiencyBonusFromCr(block.cr);
  const showCosts = form.showPf2eBlock;
  const costs = block.pf2e?.actionCosts;

  return (
    <article className="stat-sheet h-full overflow-auto p-3 text-sm">
      <header className="flex items-start gap-3">
        {block.portraitDataUrl && (
          <img
            src={block.portraitDataUrl}
            alt=""
            className="portrait-thumb h-14 w-14 shrink-0"
            draggable={false}
          />
        )}
        <div className="min-w-0">
          {!hideTitle && (
            <h3 className="sheet-title text-2xl leading-tight">
              {block.name || 'Unnamed'}
            </h3>
          )}
          <p className="text-xs italic text-muted">
            {block.size} {block.type}
            {block.alignment ? `, ${block.alignment}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-text">
            {creatureCatalogLine(block, form.showPf2eBlock)}
          </p>
          {liveActions && showCosts && (
            <p className="mt-1 font-mono-stats text-xs tabular-nums text-text">
              Actions left:{' '}
              <span className="text-accent">{liveActions.remaining}</span> / 3
            </p>
          )}
        </div>
      </header>

      <dl className="mt-2 space-y-0.5 font-mono-stats text-xs tabular-nums">
        <div>
          <span className="text-muted">Armor Class </span>
          <span className="text-text">
            {block.ac}
            {block.acDesc ? ` (${block.acDesc})` : ''}
          </span>
        </div>
        <div>
          <span className="text-muted">Hit Points </span>
          <span className="text-text">
            {block.hpAvg}
            {block.hitDice ? ` (${block.hitDice})` : ''}
          </span>
        </div>
        <div>
          <span className="text-muted">Speed </span>
          <span className="text-text">
            {Object.entries(block.speed)
              .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
              .join(', ') || '—'}
          </span>
        </div>
      </dl>

      <div className="mt-2 grid grid-cols-6 gap-1 border-y border-border py-2 text-center font-mono-stats text-[11px] tabular-nums">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
          const bonus = abilityBonusOf(block.abilityBonuses, ab);
          return (
            <div key={ab}>
              <div className="text-muted">{ABILITY_LABELS[ab]}</div>
              <div className="text-text">{formatAbilityScore(abs[ab], bonus)}</div>
              <AbilityBonusNudge
                bonus={bonus}
                onAdjust={
                  onAbilityBonus ? (delta) => onAbilityBonus(ab, delta) : undefined
                }
              />
            </div>
          );
        })}
      </div>

      <dl className="mt-2 space-y-0.5 text-xs">
        {Object.keys(block.saves).length > 0 && (
          <div>
            <span className="text-muted">Saving Throws </span>
            <span className="font-mono-stats tabular-nums text-text">
              {Object.entries(block.saves)
                .map(([k, v]) => `${k} ${formatModifier(v ?? 0)}`)
                .join(', ')}
            </span>
          </div>
        )}
        {Object.keys(block.skills).length > 0 && (
          <div>
            <span className="text-muted">Skills </span>
            <span className="font-mono-stats tabular-nums text-text">
              {Object.entries(block.skills)
                .map(
                  ([k, v]) =>
                    `${canonicalSkillName(k, block.system)} ${formatModifier(v)}`,
                )
                .join(', ')}
            </span>
          </div>
        )}
        <DefenseTraitRow
          label="Damage Resistances"
          value={block.resistances}
          kind="resist"
        />
        <DefenseTraitRow
          label="Damage Immunities"
          value={block.immunities}
          kind="immune"
        />
        <DefenseTraitRow
          label="Damage Vulnerabilities"
          value={block.vulnerabilities}
          kind="vulnerable"
        />
        <DefenseTraitRow
          label="Condition Immunities"
          value={block.conditionImmunities}
          kind="condition"
        />
        <div>
          <span className="text-muted">Senses </span>
          <span className="text-text">{block.senses || '—'}</span>
        </div>
        <div>
          <span className="text-muted">Languages </span>
          <span className="text-text">{block.languages || '—'}</span>
        </div>
        {form.showPf2eBlock && block.pf2e ? (
          <>
            <div>
              <span className="text-muted">Perception </span>
              <span className="font-mono-stats tabular-nums text-text">
                {formatModifier(block.pf2e.perception)}
              </span>
            </div>
            <div>
              <span className="text-muted">Fort / Ref / Will </span>
              <span className="font-mono-stats tabular-nums text-text">
                {formatModifier(block.pf2e.fortitude)} / {formatModifier(block.pf2e.reflex)} /{' '}
                {formatModifier(block.pf2e.will)}
              </span>
            </div>
            {block.pf2e.traits.length > 0 && (
              <div>
                <span className="text-muted">Traits </span>
                <span className="text-text">{block.pf2e.traits.join(', ')}</span>
              </div>
            )}
          </>
        ) : (
          <div>
            <span className="text-muted">Challenge </span>
            <span className="font-mono-stats tabular-nums text-text">{block.cr}</span>
            <span className="ml-2 text-muted">(PB {formatModifier(pb)})</span>
          </div>
        )}
      </dl>

      <EntryBlock title="Traits" entries={block.traits} />
      <CreatureSpellList block={block} />
      <EntryBlock
        title="Actions"
        entries={block.actions}
        showActionCosts={showCosts}
        actionCosts={costs}
        live={liveActions}
      />
      <EntryBlock title="Bonus Actions" entries={block.bonusActions} />
      <EntryBlock
        title="Reactions"
        entries={block.reactions}
        showActionCosts={showCosts}
        actionCosts={
          showCosts
            ? Object.fromEntries(
                block.reactions.map((r) => [
                  r.name,
                  costs?.[r.name] ?? ('reaction' as const),
                ]),
              )
            : undefined
        }
        live={liveActions}
      />
      {form.showLegendaryBlock && (
        <>
          {block.legendaryDesc && (
            <p className="mt-3 text-xs text-muted">{block.legendaryDesc}</p>
          )}
          <EntryBlock title="Legendary Actions" entries={block.legendaryActions} />
        </>
      )}
    </article>
  );
}
