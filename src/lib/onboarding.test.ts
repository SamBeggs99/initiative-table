import { describe, expect, it } from 'vitest';
import {
  draftToPartyMember,
  emptyPartyDraft,
  isDraftComplete,
  samplePartyForSystem,
} from './onboarding';

describe('onboarding helpers', () => {
  it('returns a complete sample party for each system', () => {
    const five = samplePartyForSystem('dnd5e');
    const pf = samplePartyForSystem('pf2e');
    expect(five.length).toBe(4);
    expect(pf.length).toBe(4);
    expect(five.every(isDraftComplete)).toBe(true);
    expect(pf.every(isDraftComplete)).toBe(true);
  });

  it('maps a draft onto a PartyMember without inventing combat state', () => {
    const draft = {
      name: 'Kaelen',
      playerName: 'Sam',
      class: 'Paladin',
      level: 3,
      ac: 18,
      maxHp: 28,
      dex: 10,
    };
    const member = draftToPartyMember('camp-1', 'dnd5e', draft);
    expect(member.campaignId).toBe('camp-1');
    expect(member.name).toBe('Kaelen');
    expect(member.class).toBe('Paladin');
    expect(member.currentHp).toBe(28);
    expect(member.maxHp).toBe(28);
    expect(member.importedFrom).toBe('manual');
  });

  it('rejects incomplete drafts', () => {
    expect(isDraftComplete(emptyPartyDraft())).toBe(false);
    expect(
      isDraftComplete({ ...emptyPartyDraft(), name: 'A', class: 'Fighter' }),
    ).toBe(true);
  });
});
