import { describe, expect, it } from 'vitest';
import { applyDamage } from './damage';
import {
  adjustPartyLiveHp,
  applyGearChange,
  applyLevelUp,
  applyLivePatch,
  applyPartyLiveWriteBack,
  applySheetPatch,
  blankPartyMember,
  formatLevelEntry,
  ensurePartyCombatants,
  restPartyForNextFight,
  isPartyMemberInCombat,
  longRestPartyMember,
  partyDisplayedHp,
  partyMembersNotInCombat,
  partyMemberToCombatant,
  proficiencyBonusForLevel,
  spellSlotsFromClassTable,
} from './party';
import { createCombatant } from '../types';
import { importDdbJson } from './import/ddb';
import { importPathbuilderJson } from './import/pathbuilder';

describe('sheet vs live', () => {
  it('live patch never mutates maxHp or ac', () => {
    const m = blankPartyMember('camp');
    m.maxHp = 44;
    m.ac = 17;
    m.currentHp = 44;
    const next = applyLivePatch(m, { currentHp: 12, tempHp: 5 });
    expect(next.currentHp).toBe(12);
    expect(next.tempHp).toBe(5);
    expect(next.maxHp).toBe(44);
    expect(next.ac).toBe(17);
  });

  it('adjustPartyLiveHp absorbs temp then damages current', () => {
    const m = blankPartyMember('camp');
    m.maxHp = 30;
    m.currentHp = 30;
    m.tempHp = 5;
    const next = adjustPartyLiveHp(m, 'damage', 8);
    expect(next.tempHp).toBe(0);
    expect(next.currentHp).toBe(27);
    expect(next.maxHp).toBe(30);
  });

  it('adjustPartyLiveHp heals without exceeding max', () => {
    const m = blankPartyMember('camp');
    m.maxHp = 20;
    m.currentHp = 12;
    const next = adjustPartyLiveHp(m, 'heal', 50);
    expect(next.currentHp).toBe(20);
    expect(next.maxHp).toBe(20);
  });

  it('partyDisplayedHp prefers linked combatant during fight', () => {
    const m = blankPartyMember('camp');
    m.id = 'pc1';
    m.currentHp = 40;
    m.maxHp = 40;
    const c = partyMemberToCombatant(m);
    c.hp = 18;
    c.tempHp = 3;
    expect(partyDisplayedHp(m, [c])).toEqual({
      currentHp: 18,
      maxHp: 40,
      tempHp: 3,
      inCombat: true,
    });
    expect(partyDisplayedHp(m, []).inCombat).toBe(false);
  });

  it('combat damage does not decrement maxHp (data-loss guard)', () => {
    const c = createCombatant({
      name: 'Kael',
      kind: 'pc',
      hp: 40,
      maxHp: 44,
      tempHp: 0,
    });
    const dmg = applyDamage(c, 14);
    expect(dmg.hp).toBe(26);
    expect(c.maxHp).toBe(44);
    const patched = { ...c, ...dmg };
    expect(patched.maxHp).toBe(44);
  });

  it('party write-back copies live HP/slots only — never maxHp/ac', () => {
    const m = blankPartyMember('camp');
    m.id = 'pc1';
    m.maxHp = 44;
    m.ac = 17;
    m.level = 5;
    m.currentHp = 44;
    m.spellSlots[1] = { max: 4, used: 0 };

    const combatant = partyMemberToCombatant(m);
    combatant.hp = 9;
    combatant.tempHp = 2;
    combatant.maxHp = 999; // hostile / buggy combat value
    combatant.ac = 99;
    combatant.spellSlots[1] = { max: 4, used: 2 };

    const { party } = applyPartyLiveWriteBack([m], [combatant]);
    expect(party[0]!.currentHp).toBe(9);
    expect(party[0]!.tempHp).toBe(2);
    expect(party[0]!.spellSlots[1]).toEqual({ max: 4, used: 2 });
    expect(party[0]!.maxHp).toBe(44);
    expect(party[0]!.ac).toBe(17);
    expect(party[0]!.level).toBe(5);
  });

  it('detects party members already linked to a combatant', () => {
    const a = blankPartyMember('camp');
    a.id = 'pc1';
    const b = blankPartyMember('camp');
    b.id = 'pc2';

    const combatants = [partyMemberToCombatant(a)];

    expect(isPartyMemberInCombat('pc1', combatants)).toBe(true);
    expect(isPartyMemberInCombat('pc2', combatants)).toBe(false);
    expect(partyMembersNotInCombat([a, b], combatants).map((m) => m.id)).toEqual([
      'pc2',
    ]);
    expect(partyMembersNotInCombat([a, b], [])).toHaveLength(2);
  });

  it('seats missing PCs without duplicating or dropping enemies', () => {
    const a = blankPartyMember('camp');
    a.id = 'pc1';
    a.name = 'Kael';
    const b = blankPartyMember('camp');
    b.id = 'pc2';
    b.name = 'Aria';
    const goblin = createCombatant({ name: 'Goblin', kind: 'npc' });
    const seated = partyMemberToCombatant(a);
    const first = ensurePartyCombatants([goblin, seated], [a, b]);
    expect(first.added).toHaveLength(1);
    expect(first.added[0]!.name).toBe('Aria');
    expect(first.combatants.map((c) => c.name)).toEqual([
      'Goblin',
      seated.name,
      'Aria',
    ]);
    const again = ensurePartyCombatants(first.combatants, [a, b]);
    expect(again.added).toHaveLength(0);
    expect(again.removed).toBe(0);
  });

  it('drops tape rows when a party member is deleted', () => {
    const a = blankPartyMember('camp');
    a.id = 'pc1';
    const b = blankPartyMember('camp');
    b.id = 'pc2';
    const result = ensurePartyCombatants(
      [partyMemberToCombatant(a), partyMemberToCombatant(b)],
      [a],
    );
    expect(result.removed).toBe(1);
    expect(result.combatants).toHaveLength(1);
    expect(result.combatants[0]!.sourcePartyMemberId).toBe('pc1');
  });

  it('resets initiative after a fight but keeps HP', () => {
    const a = blankPartyMember('camp');
    a.id = 'pc1';
    const pc = partyMemberToCombatant(a);
    pc.initiative = 18;
    pc.hp = 9;
    pc.reactionUsed = true;
    pc.concentrating = true;
    const goblin = createCombatant({ name: 'Goblin', kind: 'npc', initiative: 12 });
    const rested = restPartyForNextFight([pc, goblin]);
    expect(rested).toHaveLength(1);
    expect(rested[0]!.hp).toBe(9);
    expect(rested[0]!.initiative).toBeNull();
    expect(rested[0]!.reactionUsed).toBe(false);
    expect(rested[0]!.concentrating).toBe(false);
  });

  it('does not match monsters that happen to share a name', () => {
    const m = blankPartyMember('camp');
    m.id = 'pc1';
    m.name = 'Goblin';
    const monster = createCombatant({ name: 'Goblin', kind: 'npc' });

    expect(isPartyMemberInCombat('pc1', [monster])).toBe(false);
  });

  it('sheet patch can change maxHp without touching currentHp upward', () => {
    const m = blankPartyMember('camp');
    m.maxHp = 40;
    m.currentHp = 30;
    const next = applySheetPatch(m, { maxHp: 52, ac: 18 });
    expect(next.maxHp).toBe(52);
    expect(next.ac).toBe(18);
    expect(next.currentHp).toBe(30);
  });
});

describe('level-up', () => {
  it('writes LevelEntry and heals to new max by default', () => {
    const m = blankPartyMember('camp');
    m.level = 5;
    m.ac = 17;
    m.maxHp = 44;
    m.currentHp = 20;
    m.class = 'Paladin';

    const { member, entry, proficiencyBonus, suggestSpellSlotUpdate } =
      applyLevelUp(m, { acAfter: 18, maxHpAfter: 52, note: 'plate' });

    expect(member.level).toBe(6);
    expect(member.ac).toBe(18);
    expect(member.maxHp).toBe(52);
    expect(member.currentHp).toBe(52);
    expect(entry).toMatchObject({
      level: 6,
      acBefore: 17,
      acAfter: 18,
      maxHpBefore: 44,
      maxHpAfter: 52,
      note: 'plate',
    });
    expect(member.levelLog).toHaveLength(1);
    expect(proficiencyBonus).toBe(proficiencyBonusForLevel(6));
    expect(suggestSpellSlotUpdate).toBe(true);
    expect(formatLevelEntry(entry, 5)).toContain('L5 → L6');
  });

  it('gear change does not write LevelEntry or bump level', () => {
    const m = blankPartyMember('camp');
    m.level = 5;
    m.ac = 17;
    const next = applyGearChange(m, { ac: 19 });
    expect(next.level).toBe(5);
    expect(next.ac).toBe(19);
    expect(next.levelLog).toHaveLength(0);
  });
});

describe('spell slots + rest', () => {
  it('fills wizard slots from class table', () => {
    const slots = spellSlotsFromClassTable('Wizard', 5);
    expect(slots[1]?.max).toBe(4);
    expect(slots[2]?.max).toBe(3);
    expect(slots[3]?.max).toBe(2);
  });

  it('long rest restores HP and slot uses, not maxima', () => {
    const m = blankPartyMember('camp');
    m.maxHp = 40;
    m.currentHp = 5;
    m.spellSlots[1] = { max: 4, used: 3 };
    const rested = longRestPartyMember(m);
    expect(rested.currentHp).toBe(40);
    expect(rested.spellSlots[1]).toEqual({ max: 4, used: 0 });
  });
});

describe('importDdbJson', () => {
  it('maps a minimal DDB-shaped paste and reports unread spell slots', () => {
    const result = importDdbJson(
      JSON.stringify({
        name: 'Kael',
        classes: [
          { level: 5, definition: { name: 'Paladin' } },
        ],
        race: { fullName: 'Human' },
        stats: [
          { id: 1, value: 15 },
          { id: 2, value: 10 },
          { id: 3, value: 14 },
          { id: 4, value: 8 },
          { id: 5, value: 12 },
          { id: 6, value: 14 },
        ],
        bonusStats: [
          { id: 1, value: 0 },
          { id: 2, value: 0 },
          { id: 3, value: 0 },
          { id: 4, value: 0 },
          { id: 5, value: 0 },
          { id: 6, value: 0 },
        ],
        overrideStats: [
          { id: 1, value: 0 },
          { id: 2, value: 0 },
          { id: 3, value: 0 },
          { id: 4, value: 0 },
          { id: 5, value: 0 },
          { id: 6, value: 0 },
        ],
        baseHitPoints: 34,
        bonusHitPoints: 0,
        removedHitPoints: 4,
        temporaryHitPoints: 0,
      }),
      'camp',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.name).toBe('Kael');
    expect(result.member.level).toBe(5);
    expect(result.member.class).toContain('Paladin');
    expect(result.member.maxHp).toBe(34 + 2 * 5); // CON 14 → +2/level
    expect(result.member.currentHp).toBe(result.member.maxHp - 4);
    expect(result.unreadFields.some((f) => f.includes('spellSlots') || f.includes('armorClass'))).toBe(
      true,
    );
  });

  it('does not fail silently on empty object', () => {
    const result = importDdbJson('{}', 'camp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unreadFields.length).toBeGreaterThan(0);
  });
});

describe('importPathbuilderJson', () => {
  it('maps Pathbuilder build export', () => {
    const result = importPathbuilderJson(
      JSON.stringify({
        success: true,
        build: {
          name: 'Amiri',
          class: 'Barbarian',
          level: 3,
          ancestry: 'Human',
          abilities: { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
          attributes: {
            ancestryhp: 8,
            classhp: 12,
            bonushp: 0,
            bonushpPerLevel: 0,
          },
          acTotal: { acTotal: 18 },
          perception: 6,
        },
      }),
      'camp',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.name).toBe('Amiri');
    expect(result.member.level).toBe(3);
    expect(result.member.ac).toBe(18);
    // 8 + 3*(12+2) = 8+42 = 50
    expect(result.member.maxHp).toBe(50);
    expect(result.member.importedFrom).toBe('pathbuilder');
    expect(result.member.focusPoints?.max).toBe(1);
  });
});
