import { describe, expect, it } from 'vitest';
import {
  nethysActionCost,
  nethysToSpell,
  parseAonSpellMarkdown,
  uniquifyNethysSpellId,
  type NethysSpell,
} from './normalize-nethys';

const FIREBALL_MD = `<title level="1" right="Spell 3" pfs="Standard">
[Fireball](/Spells.aspx?ID=1530)
<actions string="Two Actions" />
</title>

<traits>
<trait label="Concentrate" url="/Traits.aspx?ID=32" />
<trait label="Fire" url="/Traits.aspx?ID=72" />
<trait label="Manipulate" url="/Traits.aspx?ID=104" />
</traits>

<column gap="tiny">

**Source** [Player Core](/Sources.aspx?ID=216) pg. 331

**Traditions**
[Arcane](/SpellLists.aspx?Tradition=1), [Primal](/SpellLists.aspx?Tradition=4)

<row gap="medium">
**Range** 500 feet

**Area** 20-foot burst
</row>

</column>

---

A roaring blast of fire detonates at a spot you designate, dealing 6d6 fire damage.

---
**Heightened (+1)** The damage increases by 2d6.`;

const fireballCore: NethysSpell = {
  name: 'Fireball',
  level: 3,
  actions: 'Two Actions',
  tradition: ['Arcane', 'Primal'],
  trait: ['Concentrate', 'Fire', 'Manipulate'],
  component: ['somatic', 'verbal'],
  range_raw: '500 feet',
  area_raw: '20-foot burst',
  markdown: FIREBALL_MD,
  primary_source: 'Player Core',
  primary_source_raw: 'Player Core pg. 331',
};

describe('nethysToSpell', () => {
  it('maps Player Core remaster fields onto Spell', () => {
    const spell = nethysToSpell(fireballCore, 'synced');
    expect(spell?.id).toBe('pf2e:nethys:fireball');
    expect(spell?.system).toBe('pf2e');
    expect(spell?.level).toBe(3);
    expect(spell?.castingTime).toBe('2 actions');
    expect(spell?.range).toBe('500 feet; 20-foot burst');
    expect(spell?.pf2e?.actions).toBe(2);
    expect(spell?.pf2e?.damage).toEqual({ expr: '6d6', type: 'fire' });
    expect(spell?.pf2e?.traditions).toEqual(['arcane', 'primal']);
    expect(spell?.desc).toMatch(/roaring blast of fire/i);
    expect(spell?.higherLevel).toMatch(/Heightened \(\+1\)/);
    expect(spell?.source).toMatch(/Player Core/);
  });

  it('skips books outside Player Core / Player Core 2', () => {
    expect(
      nethysToSpell({
        ...fireballCore,
        primary_source: 'Secrets of Magic',
      }),
    ).toBeNull();
  });

  it('skips legacy entries that point at a remaster id', () => {
    expect(
      nethysToSpell({
        ...fireballCore,
        primary_source: 'Player Core',
        remaster_id: ['spell-1530'],
      }),
    ).toBeNull();
  });

  it('keeps remaster cantrip traits so rank-1 cantrips group as cantrips', () => {
    const arc = nethysToSpell({
      name: 'Electric Arc',
      level: 1,
      actions: 'Two Actions',
      tradition: ['Arcane', 'Primal'],
      trait: ['Cantrip', 'Concentrate', 'Electricity', 'Manipulate'],
      range_raw: '30 feet',
      markdown:
        '<title></title>\n---\nAn arc of lightning jumps from one target to another.\n',
      primary_source: 'Player Core',
    });
    expect(arc?.pf2e?.traits).toContain('cantrip');
    expect(arc?.level).toBe(1);
  });

  it('suffixes ids when two core spells share a slug', () => {
    const first = nethysToSpell(fireballCore)!;
    const taken = new Set([first.id]);
    const second = uniquifyNethysSpellId(first, 'spell-999', taken);
    expect(second.id).toBe('pf2e:nethys:fireball-999');
    expect(second.slug).toBe('fireball-999');
  });
});

describe('parseAonSpellMarkdown', () => {
  it('splits description from Heightened lines', () => {
    const parsed = parseAonSpellMarkdown(FIREBALL_MD);
    expect(parsed.desc).toMatch(/6d6 fire damage/);
    expect(parsed.desc).not.toMatch(/Heightened/);
    expect(parsed.heighten).toMatch(/2d6/);
  });
});

describe('nethysActionCost', () => {
  it('reads the printed action string', () => {
    expect(nethysActionCost('One Action')).toBe(1);
    expect(nethysActionCost('Two Actions')).toBe(2);
    expect(nethysActionCost('Three Actions')).toBe(3);
    expect(nethysActionCost('Reaction')).toBe('reaction');
    expect(nethysActionCost('Free Action')).toBe('free');
  });
});
