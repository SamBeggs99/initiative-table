import { describe, expect, it } from 'vitest';
import { dataUrlByteLength, resolveCombatantPortrait } from './portrait';

describe('dataUrlByteLength', () => {
  it('estimates decoded size from base64 payload', () => {
    // "hello" → aGVsbG8= (8 chars → ~6 bytes with our 3/4 estimate)
    expect(dataUrlByteLength('data:image/jpeg;base64,aGVsbG8=')).toBe(6);
  });
});

/**
 * The resolver returns a *reference* now rather than a URL, so the caller can
 * look the bytes up in the portrait store. These assert the precedence, which
 * is unchanged: live sheet before embedded stat block.
 */
describe('resolveCombatantPortrait', () => {
  const campaign = {
    party: [{ id: 'pc1', portraitId: 'sha256-pc' }],
    npcs: [
      {
        id: 'n1',
        portraitId: 'sha256-npc',
        statBlock: { portraitId: 'sha256-block-npc' },
      },
      {
        id: 'n2',
        statBlock: { portraitId: 'sha256-block-only' },
      },
      // Not yet migrated: still carries an inline data URL.
      {
        id: 'n3',
        portraitDataUrl: 'data:legacy-npc',
      },
    ],
  };

  it('prefers the party sheet for PCs', () => {
    expect(
      resolveCombatantPortrait({ sourcePartyMemberId: 'pc1' }, campaign)
        ?.portraitId,
    ).toBe('sha256-pc');
  });

  it('prefers the NPC record over its embedded block', () => {
    expect(
      resolveCombatantPortrait({ sourceNpcId: 'n1' }, campaign)?.portraitId,
    ).toBe('sha256-npc');
  });

  it('falls back to the NPC embedded block', () => {
    expect(
      resolveCombatantPortrait({ sourceNpcId: 'n2' }, campaign)?.portraitId,
    ).toBe('sha256-block-only');
  });

  it('uses the combatant stat block for monsters', () => {
    expect(
      resolveCombatantPortrait(
        { statBlock: { portraitId: 'sha256-monster' } },
        campaign,
      )?.portraitId,
    ).toBe('sha256-monster');
  });

  it('still resolves an un-migrated inline portrait', () => {
    const ref = resolveCombatantPortrait({ sourceNpcId: 'n3' }, campaign);
    expect(ref?.portraitId).toBeUndefined();
    expect(ref?.portraitDataUrl).toBe('data:legacy-npc');
  });

  it('returns nothing when no portrait is set anywhere', () => {
    expect(resolveCombatantPortrait({ sourceNpcId: 'missing' }, campaign)).toBeUndefined();
    expect(resolveCombatantPortrait({}, campaign)).toBeUndefined();
    expect(resolveCombatantPortrait({}, null)).toBeUndefined();
  });

  it('does not treat an empty record as a portrait', () => {
    expect(
      resolveCombatantPortrait({ statBlock: {} }, campaign),
    ).toBeUndefined();
  });
});
