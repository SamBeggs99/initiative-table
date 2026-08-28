import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  adjustAbilityBonus,
  blankStatBlock,
  draftFromImport,
  estimateChallenge,
  exportCreatureJson,
  formatAbilityScore,
  HOMEBREW_EXPORT_WARNING,
  hpAvgFromHitDice,
  proficiencyBonusFromCr,
} from './statblock-derived';
import { parseStatBlockText } from './statblock-import';
import { getSystemAdapter } from '../systems';

describe('statblock derived values', () => {
  it('formats ability scores the same for 5e and PF2e', () => {
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(16)).toBe(3);
    expect(formatAbilityScore(9)).toBe('9 (-1)');
    expect(formatAbilityScore(16)).toBe('16 (+3)');
    expect(formatAbilityScore(16, 1)).toBe('16 (+4)');
    expect(formatAbilityScore(16, -1)).toBe('16 (+2)');
  });

  it('derives proficiency from CR and hpAvg from hit dice', () => {
    expect(proficiencyBonusFromCr('1/4')).toBe(2);
    expect(proficiencyBonusFromCr('11')).toBe(4);
    expect(proficiencyBonusFromCr('30')).toBe(9);
    expect(hpAvgFromHitDice('18d10+36')).toBe(135);
  });

  it('keeps printed scores and stacks a manual modifier overlay', () => {
    expect(adjustAbilityBonus(undefined, 'str', 1)).toEqual({ str: 1 });
    expect(adjustAbilityBonus({ str: 1 }, 'str', 1)).toEqual({ str: 2 });
    expect(adjustAbilityBonus({ str: 1 }, 'str', -1)).toBeUndefined();
    expect(adjustAbilityBonus({ str: 5 }, 'str', 1)).toEqual({ str: 5 });
    expect(adjustAbilityBonus({ str: 1, dex: 2 }, 'str', -1)).toEqual({ dex: 2 });
  });

  it('labels challenge estimate as an estimate', () => {
    const est = estimateChallenge({ hpAvg: 136, ac: 18, cr: '8' });
    expect(est.label).toMatch(/estimate/i);
    expect(est.note).toMatch(/not a calculation/i);
  });
});

describe('homebrew drafts', () => {
  it('blanks default to campaign system and campaign scope', () => {
    const five = blankStatBlock('dnd5e', { campaignId: 'c1' });
    expect(five.system).toBe('dnd5e');
    expect(five.origin).toBe('homebrew');
    expect(five.campaignId).toBe('c1');
    expect(five.pf2e).toBeUndefined();

    const pf = blankStatBlock('pf2e', { campaignId: 'c1' });
    expect(pf.pf2e?.level).toBe(0);
    expect(getSystemAdapter('pf2e').statBlockForm.showPf2eBlock).toBe(true);
    expect(getSystemAdapter('dnd5e').statBlockForm.showLegendaryBlock).toBe(true);
  });

  it('import path lands in a homebrew draft with derivedFrom cleared', () => {
    const raw = `
Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (−1) 14 (+2) 10 (+0) 10 (+0) 8 (−1) 8 (−1)
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action.
Actions
Scimitar. Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) slashing damage.
`.trim();
    const parsed = parseStatBlockText(raw);
    const draft = draftFromImport(parsed.statBlock, {
      system: 'dnd5e',
      campaignId: 'camp',
    });
    expect(draft.origin).toBe('homebrew');
    expect(draft.campaignId).toBe('camp');
    expect(draft.name).toBe('Goblin');
    expect(draft.derivedFromId).toBeUndefined();
    expect(HOMEBREW_EXPORT_WARNING).toMatch(/unacceptable/i);
    expect(exportCreatureJson(draft)).toContain('"name": "Goblin"');
  });
});
