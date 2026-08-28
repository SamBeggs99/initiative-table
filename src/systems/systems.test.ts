import { describe, expect, it } from 'vitest';
import { createCombatant } from '../types';
import { getSystemAdapter } from './index';
import { creatureXpForLevelDiff, pf2eBudgetThresholds } from './pf2e/encounter';

describe('getSystemAdapter', () => {
  it('returns distinct adapters without callers branching on system id', () => {
    const five = getSystemAdapter('dnd5e');
    const pf = getSystemAdapter('pf2e');
    expect(five.turnStructure).toBe('legendary');
    expect(five.downedModel).toBe('death-saves');
    expect(five.resources.kind).toBe('slots-legendary');
    expect(five.statBlockForm.showLegendaryBlock).toBe(true);
    expect(pf.turnStructure).toBe('three-action');
    expect(pf.downedModel).toBe('dying-wounded');
    expect(pf.resources.kind).toBe('focus-hero');
    expect(pf.bestiary.syncEnabled).toBe(true);
    expect(typeof pf.bestiary.sync).toBe('function');
    expect(pf.spells.syncEnabled).toBe(true);
    expect(typeof pf.spells.sync).toBe('function');
    expect(five.spells.syncEnabled).toBe(true);
    expect(typeof five.spells.sync).toBe('function');
    expect(pf.statBlockForm.showPf2eBlock).toBe(true);
  });
});

describe('dnd5e adapter', () => {
  const adapter = getSystemAdapter('dnd5e');

  it('rolls initiative as d20 + dex mod', () => {
    const c = createCombatant({ name: 'Kael', kind: 'pc', dex: 16 });
    const init = adapter.initiative(c);
    expect(init).toBeGreaterThanOrEqual(3);
    expect(init).toBeLessThanOrEqual(23);
  });

  it('resets reaction and legendary actions on turn start', () => {
    const c = createCombatant({
      name: 'Dragon',
      kind: 'npc',
      reactionUsed: true,
      legendaryActions: { max: 3, used: 2 },
    });
    const next = adapter.onTurnStart(c);
    expect(next.reactionUsed).toBe(false);
    expect(next.legendaryActions).toEqual({ max: 3, used: 0 });
  });

  it('budgets via XP thresholds', () => {
    const result = adapter.encounterBudget(
      [{ cr: '1/4' }, { cr: '1/4' }, { cr: '1/4' }, { cr: '1/4' }],
      [{ level: 3 }, { level: 3 }, { level: 3 }, { level: 3 }],
    );
    expect(result.rawXp).toBe(200);
    expect(result.adjustedXp).toBe(400);
    expect(result.thresholds.easy).toBe(300);
    expect(result.tier).toBe('easy');
  });
});

describe('pf2e adapter', () => {
  const adapter = getSystemAdapter('pf2e');

  it('uses perception for initiative without rolling', () => {
    const c = createCombatant({ name: 'Amiri', kind: 'pc', perception: 7 });
    expect(adapter.initiative(c)).toBe(7);
    expect(adapter.initiative(c)).toBe(7);
  });

  it('resets three actions and MAP on turn start', () => {
    const c = createCombatant({
      name: 'Goblin',
      kind: 'npc',
      actionsRemaining: 0,
      mapPenalty: -10,
      reactionUsed: true,
    });
    const next = adapter.onTurnStart(c);
    expect(next.actionsRemaining).toBe(3);
    expect(next.mapPenalty).toBe(0);
    expect(next.reactionUsed).toBe(false);
  });

  it('ticks down valued conditions like Frightened 2', () => {
    const c = createCombatant({
      name: 'Victim',
      kind: 'pc',
      conditions: [
        { name: 'Frightened', value: 2 },
        { name: 'Blinded' },
      ],
    });
    const { combatant, expired } = adapter.onTurnEnd(c);
    expect(expired).toEqual([]);
    expect(combatant.conditions).toEqual([
      { name: 'Frightened', value: 1 },
      { name: 'Blinded' },
    ]);

    const again = adapter.onTurnEnd(combatant);
    expect(again.expired).toEqual(['Frightened']);
    expect(again.combatant.conditions).toEqual([{ name: 'Blinded' }]);
  });

  it('uses party-size-adjusted XP budgets', () => {
    expect(pf2eBudgetThresholds(4)).toEqual({
      trivial: 40,
      low: 60,
      moderate: 80,
      severe: 120,
      extreme: 160,
    });
    expect(pf2eBudgetThresholds(5).moderate).toBe(100);
    expect(pf2eBudgetThresholds(3).severe).toBe(90);

    expect(creatureXpForLevelDiff(5, 5)).toBe(40);
    expect(creatureXpForLevelDiff(7, 5)).toBe(80);

    const result = adapter.encounterBudget(
      [{ level: 5 }, { level: 5 }],
      [{ level: 5 }, { level: 5 }, { level: 5 }, { level: 5 }],
    );
    expect(result.rawXp).toBe(80);
    expect(result.tier).toBe('moderate');
  });
});
