import { describe, expect, it } from 'vitest';
import {
  nethysToStatBlock,
  parseAonCreatureMarkdown,
  pf2eModToScore,
  uniquifyNethysCreatureId,
  type NethysCreature,
} from './normalize-nethys';

const GOBLIN_MD = `<title level="1" pfs="Standard">[Goblin Warrior](/NPCs.aspx?ID=3024)</title>

**Source** [Monster Core](/Sources.aspx?ID=221) pg. 174

**Perception** +2; [darkvision](/MonsterAbilities.aspx?ID=59)

**Languages**
[Common](/Languages.aspx?ID=1), [Goblin](/Languages.aspx?ID=6)

---

**HP** 6

**Goblin Scuttle** <actions string="Reaction" /> **Trigger** A goblin ally ends a move action adjacent to the warrior; **Effect** The goblin warrior Steps.

---

**Speed** 25 feet

**Melee**
<actions string="Single Action" />
dogslicer +7 ([Agile](/Traits.aspx?ID=526), [Backstabber](/Traits.aspx?ID=544), [Finesse](/Traits.aspx?ID=602)),
**Damage** 1d6 slashing

**Ranged**
<actions string="Single Action" />
shortbow +7 ([deadly d10](/Traits.aspx?ID=570), [range increment 60 feet](/Traits.aspx?ID=248), [reload 0](/Traits.aspx?ID=254)),
**Damage** 1d6 piercing
`;

const goblinCore: NethysCreature = {
  name: 'Goblin Warrior',
  level: -1,
  ac: 16,
  hp: 6,
  hp_raw: '6',
  size: ['Small'],
  trait: ['Goblin', 'Humanoid', 'Small'],
  strength: 0,
  dexterity: 3,
  constitution: 1,
  intelligence: 0,
  wisdom: -1,
  charisma: 1,
  perception: 2,
  fortitude_save: 5,
  reflex_save: 7,
  will_save: 3,
  speed: { land: 25, max: 25 },
  skill_mod: { acrobatics: 5, stealth: 5 },
  markdown: GOBLIN_MD,
  primary_source: 'Monster Core',
  primary_source_raw: 'Monster Core pg. 174',
  creature_family: 'Goblin',
  language_markdown: '[Common](/Languages.aspx?ID=1), [Goblin](/Languages.aspx?ID=6)',
  sense_markdown: '[darkvision](/MonsterAbilities.aspx?ID=59)',
};

describe('pf2eModToScore', () => {
  it('converts PF2e modifiers so derived 5e-style mods round-trip', () => {
    expect(pf2eModToScore(3)).toBe(16);
    expect(pf2eModToScore(-1)).toBe(8);
    expect(pf2eModToScore(0)).toBe(10);
  });
});

describe('parseAonCreatureMarkdown', () => {
  it('extracts strikes, reactions, and senses from AoN markdown', () => {
    const parsed = parseAonCreatureMarkdown(GOBLIN_MD);
    expect(parsed.senses).toMatch(/darkvision/i);
    expect(parsed.languages).toMatch(/Common/);
    expect(parsed.reactions.map((e) => e.name)).toContain('Goblin Scuttle');
    expect(parsed.actionCosts['Goblin Scuttle']).toBe('reaction');
    expect(parsed.actions.map((e) => e.name)).toEqual(
      expect.arrayContaining(['Dogslicer', 'Shortbow']),
    );
    expect(parsed.actions.find((e) => e.name === 'Dogslicer')?.desc).toMatch(/1d6 slashing/);
    expect(parsed.actionCosts.Dogslicer).toBe(1);
  });
});

describe('nethysToStatBlock', () => {
  it('maps Monster Core fields onto a PF2e StatBlock', () => {
    const block = nethysToStatBlock(goblinCore, 'synced');
    expect(block?.id).toBe('pf2e:nethys:goblin-warrior');
    expect(block?.system).toBe('pf2e');
    expect(block?.ac).toBe(16);
    expect(block?.hpAvg).toBe(6);
    expect(block?.cr).toBe('-1');
    expect(block?.abilities.dex).toBe(16);
    expect(block?.pf2e?.level).toBe(-1);
    expect(block?.pf2e?.perception).toBe(2);
    expect(block?.pf2e?.fortitude).toBe(5);
    expect(block?.speed.walk).toBe(25);
    expect(block?.type).toBe('Goblin');
    expect(block?.actions.some((a) => a.name === 'Dogslicer')).toBe(true);
    expect(block?.reactions.some((a) => a.name === 'Goblin Scuttle')).toBe(true);
  });

  it('skips books outside Monster Core / Monster Core 2', () => {
    expect(
      nethysToStatBlock({
        ...goblinCore,
        primary_source: 'Bestiary',
      }),
    ).toBeNull();
  });

  it('skips exclude_from_search hits', () => {
    expect(
      nethysToStatBlock({
        ...goblinCore,
        exclude_from_search: true,
      }),
    ).toBeNull();
  });
});

describe('uniquifyNethysCreatureId', () => {
  it('suffixes the Nethys id when the slug is taken', () => {
    const first = nethysToStatBlock(goblinCore)!;
    const taken = new Set([first.id]);
    const second = uniquifyNethysCreatureId(first, 'creature-3024', taken);
    expect(second.id).toBe('pf2e:nethys:goblin-warrior-3024');
    expect(second.slug).toBe('goblin-warrior-3024');
  });
});
