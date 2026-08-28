import type { ActiveCondition, Combatant } from '../../types';
import type { ConditionDef, SystemAdapter } from '../types';
import { pf2eBestiary } from './bestiary';
import { pf2eSpells } from './spells';
import { PF2E_CONDITIONS } from './conditions';
import { pf2eEncounterBudget } from './encounter';

function conditionDef(name: string): ConditionDef | undefined {
  const key = name.toLowerCase();
  return PF2E_CONDITIONS.find(
    (c) => c.id === key || c.name.toLowerCase() === key,
  );
}

function tickValuedConditions(
  conditions: ActiveCondition[],
  when: 'turn-end' | 'round-end',
): { next: ActiveCondition[]; expired: string[] } {
  const expired: string[] = [];
  const next: ActiveCondition[] = [];

  for (const cond of conditions) {
    const def = conditionDef(cond.name);
    if (!def?.valued || def.ticksDown !== when) {
      next.push(cond);
      continue;
    }
    const value = (cond.value ?? 1) - 1;
    if (value <= 0) {
      expired.push(cond.name);
      continue;
    }
    next.push({ ...cond, value });
  }

  return { next, expired };
}

export const pf2eAdapter: SystemAdapter = {
  id: 'pf2e',
  label: 'Pathfinder 2e',
  bestiary: pf2eBestiary,
  spells: pf2eSpells,
  turnStructure: 'three-action',
  resources: {
    kind: 'focus-hero',
    focusPoints: true,
    heroPoints: true,
    threeActions: true,
    multipleAttackPenalty: true,
  },
  downedModel: 'dying-wounded',
  conditionSet: PF2E_CONDITIONS,
  statBlockForm: {
    kind: 'pf2e',
    challengeLabel: 'Level',
    showLegendaryBlock: false,
    showLegendaryResistance: false,
    showPf2eBlock: true,
  },

  /** Perception modifier / score used as initiative — never auto-rolled. */
  initiative(c: Combatant): number {
    if (c.perception != null) return c.perception;
    if (c.statBlock?.pf2e?.perception != null) return c.statBlock.pf2e.perception;
    return c.initiative ?? 0;
  },
  initiativeIsRolled: false,

  encounterBudget: pf2eEncounterBudget,

  onTurnStart(c: Combatant): Combatant {
    return {
      ...c,
      actionsRemaining: 3,
      mapPenalty: 0,
      reactionUsed: false,
    };
  },

  onTurnEnd(c: Combatant) {
    const { next, expired } = tickValuedConditions(c.conditions, 'turn-end');
    return {
      combatant: { ...c, conditions: next },
      expired,
    };
  },

  clearCombatantResources(c: Combatant): Combatant {
    return {
      ...c,
      actionsRemaining: undefined,
      mapPenalty: undefined,
      dying: undefined,
      wounded: undefined,
      focusPoints: undefined,
      perception: undefined,
      spellSlots: Object.fromEntries(
        Object.entries(c.spellSlots).map(([lvl]) => [lvl, { max: 0, used: 0 }]),
      ),
      legendaryActions: { max: 0, used: 0 },
      legendaryResistance: { max: 0, used: 0 },
      deathSaves: { successes: 0, failures: 0 },
      concentrating: false,
    };
  },
};
