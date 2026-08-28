import { rollWithAdvantage } from '../../lib/dice';
import { encounterDifficulty } from '../../lib/encounter';
import { abilityModFromCombatant } from '../../lib/combat';
import type { Combatant } from '../../types';
import type {
  BudgetMonster,
  BudgetPartyMember,
  Difficulty,
  SystemAdapter,
} from '../types';
import { dnd5eBestiary } from './bestiary';
import { dnd5eSpells } from './spells';
import { DND5E_CONDITIONS } from './conditions';

export const dnd5eAdapter: SystemAdapter = {
  id: 'dnd5e',
  label: 'D&D 5e',
  bestiary: dnd5eBestiary,
  spells: dnd5eSpells,
  turnStructure: 'legendary',
  resources: {
    kind: 'slots-legendary',
    spellSlots: true,
    legendaryActions: true,
    legendaryResistance: true,
  },
  downedModel: 'death-saves',
  conditionSet: DND5E_CONDITIONS,
  statBlockForm: {
    kind: 'dnd5e',
    challengeLabel: 'Challenge rating',
    showLegendaryBlock: true,
    showLegendaryResistance: true,
    showPf2eBlock: false,
  },

  initiative(c: Combatant): number {
    return rollWithAdvantage(abilityModFromCombatant(c, 'dex'), 'flat').total;
  },
  initiativeIsRolled: true,

  encounterBudget(monsters: BudgetMonster[], party: BudgetPartyMember[]): Difficulty {
    const result = encounterDifficulty(
      monsters.map((m) => ({ cr: m.cr ?? String(m.level ?? 0) })),
      party,
    );
    return {
      rawXp: result.rawXp,
      adjustedXp: result.adjustedXp,
      thresholds: {
        easy: result.thresholds.easy,
        medium: result.thresholds.medium,
        hard: result.thresholds.hard,
        deadly: result.thresholds.deadly,
      },
      tier: result.tier,
    };
  },

  onTurnStart(c: Combatant): Combatant {
    return {
      ...c,
      reactionUsed: false,
      legendaryActions: { ...c.legendaryActions, used: 0 },
    };
  },

  onTurnEnd(c: Combatant) {
    return { combatant: c, expired: [] };
  },

  clearCombatantResources(c: Combatant): Combatant {
    return {
      ...c,
      spellSlots: Object.fromEntries(
        Object.entries(c.spellSlots).map(([lvl]) => [lvl, { max: 0, used: 0 }]),
      ),
      legendaryActions: { max: 0, used: 0 },
      legendaryResistance: { max: 0, used: 0 },
      deathSaves: { successes: 0, failures: 0 },
      concentrating: false,
      reactionUsed: false,
      actionsRemaining: undefined,
      mapPenalty: undefined,
      dying: undefined,
      wounded: undefined,
      focusPoints: undefined,
    };
  },
};
