import { describe, expect, it } from 'vitest';
import {
  IDENTITY_HUES,
  assignIdentityHues,
  enemyGroupKey,
  hueHex,
  pcHueId,
} from './identity';
import { createCombatant, type Combatant, type StatBlock } from '../types';

function pc(name: string, charClass: string): Combatant {
  return createCombatant({ name, kind: 'pc', charClass });
}

function monster(name: string, slug?: string): Combatant {
  const statBlock = slug ? ({ slug } as StatBlock) : undefined;
  return createCombatant({ name, kind: 'npc', statBlock });
}

describe('pcHueId', () => {
  it('gives each core class its own hue', () => {
    const classes = [
      'Artificer',
      'Barbarian',
      'Bard',
      'Cleric',
      'Druid',
      'Fighter',
      'Monk',
      'Paladin',
      'Ranger',
      'Rogue',
      'Sorcerer',
      'Warlock',
      'Wizard',
    ];
    const hues = classes.map((c) => pcHueId(c, 'seed'));
    expect(new Set(hues).size).toBe(classes.length);
  });

  it('ignores case and colours multiclass by the lead class', () => {
    expect(pcHueId('wizard', 'x')).toBe(pcHueId('Wizard', 'y'));
    expect(pcHueId('Paladin 3 / Warlock 2', 'x')).toBe(pcHueId('Paladin', 'x'));
  });

  it('falls back to a stable hue for homebrew classes and blank sheets', () => {
    expect(pcHueId('Bloodbinder', 'x')).toBe(pcHueId('Bloodbinder', 'y'));
    expect(pcHueId('', 'Kael')).toBe(pcHueId('', 'Kael'));
    expect(pcHueId('', 'Kael')).not.toBe(pcHueId('', 'Mira'));
  });
});

describe('enemyGroupKey', () => {
  it('groups by stat block slug across separate batches', () => {
    expect(enemyGroupKey(monster('Goblin A', 'goblin'))).toBe(
      enemyGroupKey(monster('Goblin', 'goblin')),
    );
  });

  it('strips copy suffixes when there is no stat block', () => {
    expect(enemyGroupKey(monster('Goblin A'))).toBe(enemyGroupKey(monster('Goblin B')));
    expect(enemyGroupKey(monster('Goblin A'))).not.toBe(enemyGroupKey(monster('Ogre')));
  });
});

describe('assignIdentityHues', () => {
  it('shares one hue within an enemy group and differs between groups', () => {
    const a = monster('Goblin A', 'goblin');
    const b = monster('Goblin B', 'goblin');
    const ogre = monster('Ogre', 'ogre');
    const hues = assignIdentityHues([a, b, ogre]);

    expect(hues.get(a.id)).toBe(hues.get(b.id));
    expect(hues.get(a.id)).not.toBe(hues.get(ogre.id));
  });

  it('never hands an enemy group a hue already worn by a PC', () => {
    const party = [
      pc('Kael', 'Paladin'),
      pc('Mira', 'Wizard'),
      pc('Sol', 'Rogue'),
      pc('Bex', 'Bard'),
    ];
    const enemies = ['goblin', 'ogre', 'wight', 'troll', 'orc'].map((s) =>
      monster(s, s),
    );
    const hues = assignIdentityHues([...party, ...enemies]);

    const partyHues = new Set(party.map((p) => hues.get(p.id)));
    for (const e of enemies) {
      expect(partyHues.has(hues.get(e.id))).toBe(false);
    }
  });

  it('keeps every enemy group distinct while hues remain', () => {
    const enemies = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => monster(s, s));
    const hues = assignIdentityHues(enemies);
    expect(new Set(enemies.map((e) => hues.get(e.id))).size).toBe(enemies.length);
  });

  it('keeps assigned hues off neighbouring steps while the palette allows', () => {
    const roster = [
      pc('Kael', 'Paladin'),
      pc('Mira', 'Wizard'),
      pc('Thorn', 'Druid'),
      monster('Goblin', 'goblin'),
      monster('Wolf', 'wolf'),
      monster('Skeleton', 'skeleton'),
    ];
    const hues = assignIdentityHues(roster);
    const indexes = roster.map((c) =>
      IDENTITY_HUES.findIndex((h) => h.id === hues.get(c.id)),
    );

    for (const c of roster) {
      if (c.kind === 'pc') continue;
      const index = IDENTITY_HUES.findIndex((h) => h.id === hues.get(c.id));
      const others = indexes.filter((i) => i !== index);
      const gaps = others.map((o) =>
        Math.min(
          Math.abs(index - o),
          IDENTITY_HUES.length - Math.abs(index - o),
        ),
      );
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not shuffle when initiative order changes', () => {
    const roster = [
      pc('Kael', 'Paladin'),
      monster('Goblin', 'goblin'),
      monster('Ogre', 'ogre'),
    ];
    const forward = assignIdentityHues(roster);
    const reversed = assignIdentityHues([...roster].reverse());

    for (const c of roster) {
      expect(reversed.get(c.id)).toBe(forward.get(c.id));
    }
  });

  it('leaves lair actions uncoloured', () => {
    const lair = createCombatant({ name: 'Lair', kind: 'lair' });
    expect(assignIdentityHues([lair]).has(lair.id)).toBe(false);
  });
});

describe('hueHex', () => {
  it('resolves known hues and ignores unknown ones', () => {
    expect(hueHex(IDENTITY_HUES[0]!.id)).toBe(IDENTITY_HUES[0]!.hex);
    expect(hueHex('not-a-hue')).toBeUndefined();
    expect(hueHex(undefined)).toBeUndefined();
  });
});
