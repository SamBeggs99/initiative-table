import { useState, type CSSProperties, type MouseEvent } from 'react';
import { HERO_POINT_SESSION_START } from '../../lib/party';
import { useStore } from '../../store';
import {
  combatantRole,
  hiddenHpLabel,
  resolveHpField,
  ROLE_LABEL,
  applyTempHp,
  type CombatantRole,
} from '../../lib/combat';
import type { StatBlockFormModel } from '../../systems';
import type { Combatant, Entry } from '../../types';
import { ConditionChips } from './ConditionChips';
import { HpBar } from './HpBar';
import { ActionStrip } from './ActionStrip';
import { HeroPointPips } from './HeroPointPips';
import { ResourcePips } from './ResourcePips';
import type { ActionCost } from '../../lib/pf2e-actions';
import { DamageTypeSelect } from './DamageTypeSelect';
import { PortraitThumb } from '../ui/Portrait';
import { damageTypeFlashColor } from '../../lib/damage-types';

const ROLE_RAIL: Record<CombatantRole, string> = {
  pc: 'bg-heal',
  npc: 'bg-condition',
  monster: 'bg-damage',
  lair: 'bg-amber',
};

export function CombatantRow({
  combatant,
  hue,
  portraitUrl,
  active,
  selected,
  focused,
  form,
  hideHp,
  showInitiative = true,
  sharedScreen = false,
  flash,
  turnPulse = false,
  damageInputRef,
  damageType,
  onDamageTypeChange,
  onSelect,
  onToggleSelect,
  onUpdate,
  onDamage,
  onHeal,
  onTemp,
  onOpenStatBlock,
  onDeathSave,
  onAddCondition,
  onRemoveCondition,
  onUseAction,
}: {
  combatant: Combatant;
  /** Identity colour for this character's class or enemy group. */
  hue?: string;
  /** Optional portrait resolved from party / NPC / stat block. */
  portraitUrl?: string;
  active: boolean;
  selected: boolean;
  focused: boolean;
  form: StatBlockFormModel;
  hideHp: boolean;
  /** Initiative is collected at Start combat — hide the pill until then. */
  showInitiative?: boolean;
  sharedScreen?: boolean;
  flash?: { type?: string; n: number };
  turnPulse?: boolean;
  damageInputRef?: (el: HTMLInputElement | null) => void;
  damageType: string;
  onDamageTypeChange: (type: string) => void;
  onSelect: (e: MouseEvent) => void;
  onToggleSelect: () => void;
  onUpdate: (patch: Partial<Combatant>) => void;
  onDamage: (n: number, detail?: string, type?: string) => void;
  onHeal: (n: number) => void;
  onTemp: (n: number) => void;
  onOpenStatBlock: () => void;
  onDeathSave: () => void;
  onAddCondition: () => void;
  onRemoveCondition: (name: string) => void;
  /** Spend action cost (PF2e) and/or roll structured damage onto the selection. */
  onUseAction?: (entry: Entry, cost: ActionCost) => void;
}) {
  const patchPartyLive = useStore((s) => s.patchPartyLive);
  const [editingInit, setEditingInit] = useState(false);
  const [dmg, setDmg] = useState('');

  const deadMonster = combatant.kind !== 'pc' && combatant.hp <= 0 && combatant.kind !== 'lair';
  const downedPc = combatant.kind === 'pc' && combatant.hp <= 0;
  const role = combatantRole(combatant);
  const identityLabel =
    combatant.kind === 'pc'
      ? combatant.charClass?.trim()
      : combatant.statBlock?.type?.trim();

  const submitField = (heal: boolean) => {
    const parsed = resolveHpField(dmg);
    if (!parsed) return;
    if (parsed.kind === 'temp') {
      onTemp(applyTempHp(combatant.tempHp, parsed.amount, parsed.tempOp ?? 'set'));
    }
    else if (heal || parsed.kind === 'heal') onHeal(parsed.amount);
    else {
      onDamage(
        parsed.amount,
        parsed.detail,
        parsed.type || damageType || undefined,
      );
    }
    setDmg('');
  };

  return (
    <div
      className={`row-combat px-3 py-2 ${active ? 'row-active row-reveal' : ''} ${
        selected ? 'row-selected row-reveal' : ''
      } ${focused && !active ? 'row-focused' : ''} ${
        deadMonster ? 'row-dead line-through' : ''
      } ${turnPulse && active ? 'row-turn-pulse' : ''}`}
      style={
        {
          ...(hue ? { '--identity': hue } : {}),
          ...(flash
            ? { '--flash': damageTypeFlashColor(flash.type) }
            : {}),
        } as CSSProperties
      }
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!sharedScreen) onOpenStatBlock();
      }}
    >
      {flash && (
        <span
          key={flash.n}
          className="row-flash-light"
          aria-hidden
        />
      )}
      <div className="relative z-[2] flex items-start gap-2.5">
        {!sharedScreen && (
          <input
            type="checkbox"
            className="mt-1.5 accent-[var(--color-accent)]"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${combatant.name} for bulk damage`}
            title="Select for AoE / bulk HP"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {showInitiative &&
              (editingInit && !sharedScreen ? (
                <input
                  autoFocus
                  type="number"
                  className="field w-14 py-0.5 text-center font-mono-stats text-base tabular-nums"
                  value={combatant.initiative ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      initiative:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  onBlur={() => setEditingInit(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingInit(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  type="button"
                  className={`init-pill ${active ? 'init-pill-active' : ''}`}
                  title={sharedScreen ? undefined : 'Edit initiative'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!sharedScreen) setEditingInit(true);
                  }}
                >
                  {combatant.initiative ?? '—'}
                </button>
              ))}

            <span
              className={`h-4 w-[3px] shrink-0 rounded-full ${ROLE_RAIL[role]}`}
              title={ROLE_LABEL[role]}
            >
              <span className="sr-only">{ROLE_LABEL[role]}</span>
            </span>

            {hue && <span className="identity-swatch" aria-hidden />}

            <PortraitThumb
              src={portraitUrl}
              alt=""
              size={sharedScreen ? 'sm' : 'xs'}
            />

            <button
              type="button"
              className="row-name min-w-0 flex-1 truncate text-left text-[0.95rem]"
              title={
                sharedScreen
                  ? combatant.name
                  : identityLabel
                    ? `Open stats — ${combatant.name} (${identityLabel})`
                    : `Open stats — ${combatant.name}`
              }
              onClick={(e) => {
                e.stopPropagation();
                if (!sharedScreen) onOpenStatBlock();
              }}
            >
              {combatant.name}
            </button>

            {deadMonster && (
              <span className="shrink-0 rounded-sm bg-damage/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-damage">
                Dead
              </span>
            )}

            {sharedScreen && combatant.conditions.length > 0 && (
              <ConditionChips
                conditions={combatant.conditions}
                onRemove={() => undefined}
                onAdd={() => undefined}
                addButtonClassName="hidden"
              />
            )}

            <span className="vital-pair">
              AC <b>{combatant.ac}</b>
            </span>

            {form.showPf2eBlock && combatant.kind === 'pc' && (
              <HeroPointPips
                value={combatant.heroPoints ?? HERO_POINT_SESSION_START}
                readOnly={sharedScreen}
                compact
                onChange={
                  sharedScreen
                    ? undefined
                    : (next) => {
                        if (combatant.sourcePartyMemberId) {
                          patchPartyLive(combatant.sourcePartyMemberId, {
                            heroPoints: next,
                          });
                        } else {
                          onUpdate({ heroPoints: next });
                        }
                      }
                }
              />
            )}

            <div className="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs">
              <span className="row-hp w-[4.5rem] shrink-0 text-right font-mono-stats text-sm font-semibold tabular-nums text-text">
                {hideHp || combatant.hidden || sharedScreen ? (
                  <span className="text-condition">{hiddenHpLabel(combatant)}</span>
                ) : (
                  <>
                    <span className={combatant.hp <= 0 ? 'text-damage' : ''}>
                      {combatant.hp}
                    </span>
                    <span className="text-muted">/{combatant.maxHp}</span>
                    {combatant.tempHp > 0 && (
                      <span className="text-heal"> +{combatant.tempHp}</span>
                    )}
                  </>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <HpBar combatant={combatant} />
              </div>
            </div>

            {!sharedScreen && (
              <button
                type="button"
                className={`shrink-0 text-[10px] transition-colors ${
                  combatant.hidden
                    ? 'text-condition'
                    : 'row-affordance text-muted/70 hover:text-text'
                }`}
                title={
                  combatant.hidden ? 'Show exact HP' : 'Hide HP on shared screen'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ hidden: !combatant.hidden });
                }}
              >
                {combatant.hidden ? 'banded' : 'hide'}
              </button>
            )}
          </div>

          {!sharedScreen && (
            <div
              className={`mt-1 flex flex-wrap items-center gap-2 ${
                deadMonster ? 'pointer-events-none opacity-60' : ''
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <label className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  HP
                </span>
                <input
                  ref={(el) => {
                    damageInputRef?.(el);
                  }}
                  className="field-tape w-28 py-0.5 font-mono-stats text-sm tabular-nums"
                  value={dmg}
                  onChange={(e) => setDmg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitField(e.shiftKey);
                    }
                  }}
                  disabled={deadMonster}
                  aria-label={`Damage ${combatant.name}`}
                  title="12 or -12 = damage (temp first). +12 or h12 = heal, capped at max HP. *5 = add temp. t8 = replace temp. Dice: 2d6+3. Type: 12 fire"
                />
              </label>
              <DamageTypeSelect
                value={damageType}
                onChange={onDamageTypeChange}
                className="row-affordance w-[6.5rem]"
              />
              <button
                type="button"
                className={`btn btn-sm ${dmg.trim() ? 'btn-heal' : 'btn-text'}`}
                disabled={deadMonster || !dmg.trim()}
                onClick={() => submitField(true)}
              >
                Heal
              </button>
              <ConditionChips
                conditions={combatant.conditions}
                onRemove={onRemoveCondition}
                onAdd={onAddCondition}
                addButtonClassName="row-affordance"
              />
              <ResourcePips
                combatant={combatant}
                form={form}
                onToggleReaction={() =>
                  onUpdate({ reactionUsed: !combatant.reactionUsed })
                }
                onToggleConcentration={() =>
                  onUpdate({ concentrating: !combatant.concentrating })
                }
                onSpendLegendary={() =>
                  onUpdate({
                    legendaryActions: {
                      ...combatant.legendaryActions,
                      used: Math.min(
                        combatant.legendaryActions.max,
                        combatant.legendaryActions.used + 1,
                      ),
                    },
                  })
                }
                onSpendLimited={(name) =>
                  onUpdate({
                    limitedUses: combatant.limitedUses.map((u) =>
                      u.name === name
                        ? { ...u, used: Math.min(u.max, u.used + 1) }
                        : u,
                    ),
                  })
                }
                onSpendAction={() =>
                  onUpdate({
                    actionsRemaining: Math.max(
                      0,
                      (combatant.actionsRemaining ?? 3) - 1,
                    ),
                  })
                }
                onRestoreActions={() =>
                  onUpdate({ actionsRemaining: 3, mapPenalty: 0 })
                }
              />
            </div>
          )}

          {!sharedScreen &&
            onUseAction &&
            (combatant.statBlock?.actions?.length ?? 0) > 0 && (
              <div className={active ? '' : 'row-affordance'}>
                <ActionStrip
                  actions={combatant.statBlock!.actions}
                  actionCosts={combatant.statBlock!.pf2e?.actionCosts}
                  actionsRemaining={combatant.actionsRemaining ?? 3}
                  showCosts={form.showPf2eBlock}
                  disabled={deadMonster}
                  onUse={onUseAction}
                />
              </div>
            )}

          {downedPc && !sharedScreen && (
            <div
              className="mt-1.5 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="section-title">Death</span>
              <span className="font-mono-stats text-xs tabular-nums text-heal">
                {'●'.repeat(combatant.deathSaves.successes)}
                {'○'.repeat(3 - combatant.deathSaves.successes)}
              </span>
              <span className="font-mono-stats text-xs tabular-nums text-damage">
                {'●'.repeat(combatant.deathSaves.failures)}
                {'○'.repeat(3 - combatant.deathSaves.failures)}
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onDeathSave}>
                Roll death save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
