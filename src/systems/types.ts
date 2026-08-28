import type { Combatant, System } from '../types';

export type TurnStructure = 'legendary' | 'three-action';
export type DownedModel = 'death-saves' | 'dying-wounded';

export type ResourceModel =
  | {
      kind: 'slots-legendary';
      spellSlots: true;
      legendaryActions: true;
      legendaryResistance: true;
    }
  | {
      kind: 'focus-hero';
      focusPoints: true;
      heroPoints: true;
      threeActions: true;
      multipleAttackPenalty: true;
    };

export interface ConditionDef {
  id: string;
  name: string;
  /** Valued conditions (Frightened 2, Clumsy 1, …). */
  valued: boolean;
  /** When the value decreases by 1 (removed at 0). */
  ticksDown: 'turn-end' | 'round-end' | null;
  description?: string;
}

export interface SpellSyncHookProgress {
  fetched: number;
  total?: number;
  message?: string;
}

export interface SpellSource {
  id: string;
  label: string;
  /** 5e-bits SRD / Archives of Nethys full catalog sync. */
  syncEnabled: boolean;
  syncDisabledReason?: string;
  sync?(
    onProgress?: (p: SpellSyncHookProgress) => void,
  ): Promise<{ count: number; retired: number }>;
}

export interface BestiarySource {
  id: string;
  label: string;
  /** Open5e-style full sync. False for PF2e until an AoN adapter lands. */
  syncEnabled: boolean;
  syncDisabledReason?: string;
  /** Placeholder for M4 / future API adapters. */
  sync?(onProgress?: (done: number, total?: number) => void): Promise<void>;
}

/** Shared difficulty shape — threshold keys differ per system. */
export interface Difficulty {
  rawXp: number;
  adjustedXp: number;
  thresholds: Record<string, number>;
  tier: string;
}

export interface BudgetMonster {
  cr?: string;
  level?: number;
  xp?: number;
}

export interface BudgetPartyMember {
  level: number;
}

/** Which creature-editor fields to render — consumers read this, never branch on System. */
export type StatBlockFormModel =
  | {
      kind: 'dnd5e';
      challengeLabel: 'Challenge rating';
      showLegendaryBlock: true;
      showLegendaryResistance: true;
      showPf2eBlock: false;
    }
  | {
      kind: 'pf2e';
      challengeLabel: 'Level';
      showLegendaryBlock: false;
      showLegendaryResistance: false;
      showPf2eBlock: true;
    };

export interface SystemAdapter {
  id: System;
  label: string;
  bestiary: BestiarySource;
  spells: SpellSource;
  turnStructure: TurnStructure;
  resources: ResourceModel;
  downedModel: DownedModel;
  conditionSet: ConditionDef[];
  statBlockForm: StatBlockFormModel;
  /**
   * 5e: rolls d20 + dex mod.
   * PF2e: returns perception (from combatant / stat block); does not roll.
   */
  initiative(c: Combatant): number;
  /** False when initiative is a static score, so group rolls do not apply. */
  initiativeIsRolled: boolean;
  encounterBudget(monsters: BudgetMonster[], party: BudgetPartyMember[]): Difficulty;
  /** Reset turn-scoped resources when this combatant's turn begins. */
  onTurnStart(c: Combatant): Combatant;
  /** Tick valued conditions that reduce at end of this combatant's turn. */
  onTurnEnd(c: Combatant): { combatant: Combatant; expired: string[] };
  /** Strip system-specific live resources when changing campaign system. */
  clearCombatantResources(c: Combatant): Combatant;
}
