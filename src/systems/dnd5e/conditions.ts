import type { ConditionDef } from '../types';

/** Common D&D 5e conditions (PHB / basic rules). */
export const DND5E_CONDITIONS: ConditionDef[] = [
  { id: 'blinded', name: 'Blinded', valued: false, ticksDown: null },
  { id: 'charmed', name: 'Charmed', valued: false, ticksDown: null },
  { id: 'deafened', name: 'Deafened', valued: false, ticksDown: null },
  { id: 'exhaustion', name: 'Exhaustion', valued: true, ticksDown: null, description: 'Levels 1–6' },
  { id: 'frightened', name: 'Frightened', valued: false, ticksDown: null },
  { id: 'grappled', name: 'Grappled', valued: false, ticksDown: null },
  { id: 'incapacitated', name: 'Incapacitated', valued: false, ticksDown: null },
  { id: 'invisible', name: 'Invisible', valued: false, ticksDown: null },
  { id: 'paralyzed', name: 'Paralyzed', valued: false, ticksDown: null },
  { id: 'petrified', name: 'Petrified', valued: false, ticksDown: null },
  { id: 'poisoned', name: 'Poisoned', valued: false, ticksDown: null },
  { id: 'prone', name: 'Prone', valued: false, ticksDown: null },
  { id: 'restrained', name: 'Restrained', valued: false, ticksDown: null },
  { id: 'stunned', name: 'Stunned', valued: false, ticksDown: null },
  { id: 'unconscious', name: 'Unconscious', valued: false, ticksDown: null },
];
