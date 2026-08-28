import type { System } from '../types';
import { dnd5eAdapter } from './dnd5e';
import { pf2eAdapter } from './pf2e';
import type { SystemAdapter } from './types';

export type {
  BestiarySource,
  SpellSource,
  SpellSyncHookProgress,
  BudgetMonster,
  BudgetPartyMember,
  ConditionDef,
  Difficulty,
  DownedModel,
  ResourceModel,
  StatBlockFormModel,
  SystemAdapter,
  TurnStructure,
} from './types';

export const SYSTEM_ADAPTERS: Record<System, SystemAdapter> = {
  dnd5e: dnd5eAdapter,
  pf2e: pf2eAdapter,
};

export function getSystemAdapter(system: System): SystemAdapter {
  return SYSTEM_ADAPTERS[system];
}

export { dnd5eAdapter } from './dnd5e';
export { pf2eAdapter } from './pf2e';
