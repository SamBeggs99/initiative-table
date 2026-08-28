import {
  expireConditionsAtTurnEnd,
  expireConditionsForRound,
  processRecharges,
} from './combat';
import type { SystemAdapter } from '../systems';
import type { Combatant, CombatState, LogEntry } from '../types';

type LogPush = Pick<LogEntry, 'message' | 'kind'>;

function applyTurnStart(
  combatant: Combatant,
  adapter: SystemAdapter,
): { combatant: Combatant; logs: LogPush[] } {
  let next = adapter.onTurnStart(combatant);
  const logs: LogPush[] = [];
  const recharge = processRecharges(next.limitedUses);
  next = { ...next, limitedUses: recharge.limitedUses };
  for (const message of recharge.log) {
    logs.push({ message: `${next.name}: ${message}`, kind: 'system' });
  }
  return { combatant: next, logs };
}

/**
 * Advance initiative: end current turn (condition expiry + valued ticks),
 * maybe bump round (round-based expiry), start next (reset resources + recharge rolls).
 */
export function advanceCombatTurn(
  combat: CombatState,
  adapter: SystemAdapter,
): { combat: CombatState; logs: LogPush[] } {
  const logs: LogPush[] = [];
  if (combat.combatants.length === 0) {
    return { combat, logs };
  }

  let combatants = [...combat.combatants];
  const current = combatants[combat.turnIndex];

  if (current && combat.started) {
    // Conditions that end at the end of this combatant's turn (on anyone)
    combatants = combatants.map((c) => {
      const { conditions, expired } = expireConditionsAtTurnEnd(c, current.id);
      for (const name of expired) {
        logs.push({
          message: `${c.name}: ${name} ends (end of ${current.name}'s turn)`,
          kind: 'condition',
        });
      }
      return { ...c, conditions };
    });

    const self = combatants[combat.turnIndex]!;
    const ended = adapter.onTurnEnd(self);
    combatants[combat.turnIndex] = ended.combatant;
    for (const name of ended.expired) {
      logs.push({ message: `${self.name}: ${name} ends`, kind: 'condition' });
    }
  }

  let turnIndex = combat.turnIndex + 1;
  let round = combat.round;
  if (turnIndex >= combatants.length) {
    turnIndex = 0;
    round += 1;
    combatants = combatants.map((c) => {
      const { conditions, expired } = expireConditionsForRound(c, round);
      for (const name of expired) {
        logs.push({
          message: `${c.name}: ${name} ends (round ${round})`,
          kind: 'condition',
        });
      }
      return { ...c, conditions };
    });
  }

  const active = combatants[turnIndex];
  if (active) {
    const started = applyTurnStart(active, adapter);
    combatants[turnIndex] = started.combatant;
    logs.push(...started.logs);
  }

  logs.push({
    message: `Round ${round} — ${active?.name ?? '—'}`,
    kind: 'turn',
  });

  return {
    combat: {
      ...combat,
      turnIndex,
      round,
      combatants,
      started: true,
    },
    logs,
  };
}

/**
 * Keep the active turn on the same combatant when someone earlier in the order
 * is removed. When the active combatant is removed, the next one slides into
 * their slot (wrapping to 0 if they were last).
 */
export function turnIndexAfterRemove(
  length: number,
  turnIndex: number,
  removedIndex: number,
): number {
  if (removedIndex < 0 || length <= 0) return Math.max(0, turnIndex);
  if (length === 1) return 0;
  const nextLen = length - 1;
  if (removedIndex < turnIndex) return turnIndex - 1;
  if (removedIndex > turnIndex) return Math.min(turnIndex, nextLen - 1);
  return turnIndex >= nextLen ? 0 : turnIndex;
}

export function beginCombat(
  combatants: Combatant[],
  adapter: SystemAdapter,
  prior?: Pick<CombatState, 'loot' | 'sourceEncounterName'>,
): { combat: CombatState; logs: LogPush[] } {
  const logs: LogPush[] = [];
  let list = [...combatants];
  if (list[0]) {
    const started = applyTurnStart(list[0], adapter);
    list[0] = started.combatant;
    logs.push(...started.logs);
  }
  logs.push({ message: 'Combat started', kind: 'system' });
  return {
    combat: {
      round: 1,
      turnIndex: 0,
      started: true,
      combatants: list,
      // Callers used to forget this and silently drop planned loot.
      loot: prior?.loot ?? [],
      sourceEncounterName: prior?.sourceEncounterName,
    },
    logs,
  };
}
