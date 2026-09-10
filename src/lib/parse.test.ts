import { describe, expect, it } from 'vitest';
import {
  attackBonusFromDesc,
  damageFieldsFromDesc,
  damagePartsFromDesc,
  durationFromDesc,
  enrichEntry,
  enrichEntryDamage,
  enrichEntryDuration,
  enrichEntryOffense,
  enrichEntryRequirements,
  formatEntryOffense,
  parseAttack,
  parseDamage,
  parseLegendaryCount,
  parseLimitedUses,
  parseSaveDC,
  parseSpellDamage,
  parseSpellSlots,
  requirementsFromDesc,
  saveDcFromDesc,
} from './parse';

describe('parseAttack', () => {
  it('parses "+7 to hit"', () => {
    expect(parseAttack('+7 to hit')).toEqual({ toHit: 7 });
  });

  it('parses negative and spaced forms', () => {
    expect(parseAttack('Melee Weapon Attack: -1 to hit')).toEqual({ toHit: -1 });
    expect(parseAttack('+10 to hit, reach 5 ft.')).toEqual({ toHit: 10 });
  });

  it('parses attack modifier and Strike forms', () => {
    expect(parseAttack('Spell attack modifier +7')).toEqual({ toHit: 7 });
    expect(parseAttack('Strike +12')).toEqual({ toHit: 12 });
  });
});

describe('parseDamage', () => {
  it('parses multi-part damage with parenthetical dice', () => {
    expect(
      parseDamage('13 (2d8 + 4) piercing damage plus 7 (2d6) fire damage'),
    ).toEqual([
      { dice: '2d8+4', type: 'piercing' },
      { dice: '2d6', type: 'fire' },
    ]);
  });

  it('parses a single damage clause', () => {
    expect(parseDamage('Hit: 5 (1d6 + 2) slashing damage.')).toEqual([
      { dice: '1d6+2', type: 'slashing' },
    ]);
  });
});

describe('parseSpellDamage', () => {
  it('reads PF2e dice + type from spell prose', () => {
    expect(
      parseSpellDamage(
        'A roaring blast of fire detonates at a spot you designate, dealing 6d6 fire damage.',
      ),
    ).toEqual({ expr: '6d6', type: 'fire' });
    expect(
      parseSpellDamage(
        'Each of up to two creatures within range must attempt a basic Reflex save. The spell deals 2d4 electricity damage.',
      ),
    ).toEqual({ expr: '2d4', type: 'electricity' });
  });

  it('takes the first physical type from an or-list and skips persistent extras', () => {
    expect(
      parseSpellDamage(
        'On a hit, you deal 1d6 bludgeoning, piercing, or slashing damage, depending on the object.',
      ),
    ).toEqual({ expr: '1d6', type: 'bludgeoning' });
    expect(
      parseSpellDamage(
        'The target takes 2d8 acid damage plus 1d6 persistent acid damage.',
      ),
    ).toEqual({ expr: '2d8', type: 'acid' });
  });

  it('returns nothing when the spell does not deal damage', () => {
    expect(
      parseSpellDamage(
        'You raise a magical shield of force that grants you a +1 circumstance bonus to AC.',
      ),
    ).toBeUndefined();
  });
});

describe('damageFieldsFromDesc / enrichEntryDamage', () => {
  it('pulls the first Hit damage into structured fields', () => {
    expect(
      damageFieldsFromDesc(
        'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) slashing damage.',
      ),
    ).toEqual({ expr: '1d6+2', type: 'slashing' });
  });

  it('enrichEntryDamage leaves an existing expr alone', () => {
    const entry = {
      name: 'Bite',
      desc: 'Hit: 5 (1d6 + 2) slashing damage.',
      damage: { expr: '2d6', type: 'piercing' },
    };
    expect(enrichEntryDamage(entry)).toEqual(entry);
  });

  it('enrichEntryDamage fills from desc when missing', () => {
    expect(
      enrichEntryDamage({
        name: 'Scimitar',
        desc: 'Hit: 5 (1d6 + 2) slashing damage.',
      }),
    ).toEqual({
      name: 'Scimitar',
      desc: 'Hit: 5 (1d6 + 2) slashing damage.',
      damage: { expr: '1d6+2', type: 'slashing' },
    });
  });

  it('damagePartsFromDesc keeps every clause on the Hit line', () => {
    expect(
      damagePartsFromDesc(
        'Hit: 7 (1d8 + 3) piercing damage plus 3 (1d6) fire damage.',
      ),
    ).toEqual([
      { expr: '1d8+3', type: 'piercing' },
      { expr: '1d6', type: 'fire' },
    ]);
  });

  it('enrichEntryDamage files extra clauses as riders', () => {
    expect(
      enrichEntryDamage({
        name: 'Flame Tongue',
        desc: 'Hit: 7 (1d8 + 3) slashing damage plus 7 (2d6) fire damage.',
      }),
    ).toEqual({
      name: 'Flame Tongue',
      desc: 'Hit: 7 (1d8 + 3) slashing damage plus 7 (2d6) fire damage.',
      damage: { expr: '1d8+3', type: 'slashing' },
      extraDamage: [{ expr: '2d6', type: 'fire' }],
    });
  });

  it('enrichEntryDamage leaves extraDamage off a single-clause hit', () => {
    expect(
      enrichEntryDamage({
        name: 'Club',
        desc: 'Hit: 3 (1d4 + 1) bludgeoning damage.',
      }),
    ).not.toHaveProperty('extraDamage');
  });
});

describe('requirementsFromDesc / enrichEntryRequirements', () => {
  it('parses a PF2e-style Requirements clause', () => {
    expect(
      requirementsFromDesc(
        'Requirements You are wielding a melee weapon. Trigger An enemy moves. Effect You Strike.',
      ),
    ).toBe('You are wielding a melee weapon.');
  });

  it('parses Prerequisite without a following labelled clause', () => {
    expect(
      requirementsFromDesc(
        'Prerequisite: The target is grappled. You deal extra damage.',
      ),
    ).toBe('The target is grappled. You deal extra damage.');
  });

  it('enrichEntryRequirements leaves an existing note alone', () => {
    const entry = {
      name: 'Parry',
      desc: 'Requirements You hold a shield. Effect …',
      requirements: 'Holding a shield',
    };
    expect(enrichEntryRequirements(entry)).toEqual(entry);
  });
});

describe('durationFromDesc / enrichEntryDuration', () => {
  it('parses a labelled Duration clause', () => {
    expect(
      durationFromDesc(
        'Duration 1 minute. Effect The target is frightened.',
      ),
    ).toBe('1 minute');
  });

  it('parses a lasts-for phrase', () => {
    expect(
      durationFromDesc('The target is paralyzed and lasts for 1 minute.'),
    ).toBe('1 minute');
  });

  it('enrichEntryDuration leaves an existing note alone', () => {
    const entry = {
      name: 'Hold',
      desc: 'Duration 1 minute. Effect …',
      duration: 'until end of turn',
    };
    expect(enrichEntryDuration(entry)).toEqual(entry);
  });

  it('enrichEntryDuration fills from desc when missing', () => {
    expect(
      enrichEntryDuration({
        name: 'Hold',
        desc: 'Duration 1 minute. Effect The target is held.',
      }),
    ).toMatchObject({ duration: '1 minute' });
  });
});

describe('saveDcFromDesc / attackBonusFromDesc / enrichEntryOffense', () => {
  it('reads a save DC with an ability', () => {
    expect(saveDcFromDesc('DC 17 Dexterity saving throw')).toBe(17);
  });

  it('reads a bare DC when no ability is named', () => {
    expect(saveDcFromDesc('spell save DC 15')).toBe(15);
  });

  it('reads an attack bonus from to-hit prose', () => {
    expect(attackBonusFromDesc('Melee Weapon Attack: +7 to hit')).toBe(7);
  });

  it('enrichEntryOffense fills a missing attack bonus and leaves an existing one', () => {
    expect(
      enrichEntryOffense({
        name: 'Bite',
        desc: 'Melee Weapon Attack: +5 to hit. DC 13 Strength save.',
      }),
    ).toEqual({
      name: 'Bite',
      desc: 'Melee Weapon Attack: +5 to hit. DC 13 Strength save.',
      attackBonus: 5,
    });
    const kept = {
      name: 'Bite',
      desc: 'Melee Weapon Attack: +5 to hit. DC 13 Strength save.',
      attackBonus: 9,
    };
    expect(enrichEntryOffense(kept)).toEqual(kept);
  });
});

describe('formatEntryOffense', () => {
  it('prints the attack bonus only — Spell DC is not an action field', () => {
    expect(formatEntryOffense({ attackBonus: 7 })).toBe('+7');
    expect(formatEntryOffense({ attackBonus: -1 })).toBe('-1');
    expect(formatEntryOffense({})).toBe('');
  });
});

describe('enrichEntry', () => {
  it('fills damage, requirements, duration, and attack bonus from prose', () => {
    const filled = enrichEntry({
      name: 'Breath',
      desc: 'Requirements The dragon is flying. Duration 1 minute. DC 18 Dexterity saving throw. Hit: 33 (6d10) fire damage.',
    });
    expect(filled).toMatchObject({
      damage: { expr: '6d10', type: 'fire' },
      requirements: 'The dragon is flying.',
      duration: '1 minute',
    });
    expect(filled).not.toHaveProperty('saveDc');
  });
});

describe('parseSaveDC', () => {
  it('parses "DC 17 Dexterity saving throw"', () => {
    expect(parseSaveDC('DC 17 Dexterity saving throw')).toEqual({
      dc: 17,
      ability: 'dex',
    });
  });

  it('parses abbreviated ability names', () => {
    expect(parseSaveDC('DC 14 CON save')).toEqual({ dc: 14, ability: 'con' });
  });
});

describe('parseSpellSlots', () => {
  it('parses leveled slots', () => {
    expect(parseSpellSlots('1st level (4 slots):')).toEqual({
      1: { max: 4, used: 0 },
    });
  });

  it('ignores cantrips at will', () => {
    expect(parseSpellSlots('Cantrips (at will)')).toEqual({});
  });

  it('parses multiple level lines', () => {
    const text = [
      'Cantrips (at will): fire bolt',
      '1st level (4 slots): magic missile',
      '2nd level (3 slots): scorching ray',
    ].join('\n');
    expect(parseSpellSlots(text)).toEqual({
      1: { max: 4, used: 0 },
      2: { max: 3, used: 0 },
    });
  });
});

describe('parseLimitedUses', () => {
  it('parses (3/Day)', () => {
    expect(parseLimitedUses('Fire Breath (3/Day)')).toEqual({ max: 3 });
  });

  it('parses Recharge 5-6 and Recharge 6', () => {
    expect(parseLimitedUses('Breath Weapon (Recharge 5–6)')).toEqual({
      max: 1,
      recharge: '5-6',
    });
    expect(parseLimitedUses('Frightful Presence (Recharge 6)')).toEqual({
      max: 1,
      recharge: '6',
    });
  });

  it('parses rest recharge', () => {
    expect(
      parseLimitedUses('Invisibility (Recharges after a Short or Long Rest)'),
    ).toEqual({ max: 1, recharge: 'rest' });
  });

  it('finds Legendary Resistance in trait text', () => {
    expect(
      parseLimitedUses('Legendary Resistance (3/Day). If the dragon fails…'),
    ).toEqual({ max: 3, name: 'Legendary Resistance' });
  });
});

describe('parseLegendaryCount', () => {
  it('parses "can take 3 legendary actions"', () => {
    expect(parseLegendaryCount('The dragon can take 3 legendary actions')).toBe(3);
  });

  it('defaults to 3 when missing', () => {
    expect(parseLegendaryCount('Legendary Actions')).toBe(3);
  });
});
