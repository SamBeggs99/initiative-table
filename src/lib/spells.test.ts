import { describe, expect, it } from 'vitest';
import { open5eToSpell } from './spells/normalize-open5e';
import {
  ensureSpellsSeeded,
  searchSpells,
  spellDb,
} from './spells';

describe('open5eToSpell', () => {
  it('maps SRD fields onto the shared Spell shape', () => {
    const spell = open5eToSpell(
      {
        slug: 'fireball',
        name: 'Fireball',
        desc: 'A bright streak…',
        higher_level: '+1d6 per slot level above 3rd.',
        range: '150 feet',
        components: 'V, S, M',
        material: 'a tiny ball of bat guano and sulfur',
        ritual: 'no',
        duration: 'Instantaneous',
        concentration: 'no',
        casting_time: '1 action',
        level_int: 3,
        school: 'Evocation',
        spell_lists: ['sorcerer', 'wizard'],
        document__slug: 'wotc-srd',
        document__title: '5e Core Rules',
      },
      'synced',
    );
    expect(spell.id).toBe('dnd5e:wotc-srd:fireball');
    expect(spell.system).toBe('dnd5e');
    expect(spell.level).toBe(3);
    expect(spell.components).toContain('bat guano');
    expect(spell.classes).toEqual(['sorcerer', 'wizard']);
    expect(spell.concentration).toBe(false);
  });
});

describe('searchSpells', () => {
  it('finds bundled 5e and PF2e spells without mixing systems', async () => {
    await spellDb.spells.clear();
    await ensureSpellsSeeded();

    const fire = await searchSpells({ system: 'dnd5e', query: 'fireball' });
    expect(fire[0]?.spell.name).toBe('Fireball');
    expect(fire[0]?.spell.system).toBe('dnd5e');

    const arc = await searchSpells({ system: 'pf2e', query: 'electric' });
    expect(arc[0]?.spell.name).toBe('Electric Arc');
    expect(arc.every((r) => r.spell.system === 'pf2e')).toBe(true);

    const cantrips = await searchSpells({ system: 'pf2e', level: 0 });
    expect(cantrips.some((r) => r.spell.name === 'Electric Arc')).toBe(true);
    expect(cantrips.some((r) => r.spell.name === 'Heal')).toBe(false);
  });
});
