import { describe, expect, it } from 'vitest';
import { dataUrlByteLength, resolveCombatantPortrait } from './portrait';

describe('dataUrlByteLength', () => {
  it('estimates decoded size from base64 payload', () => {
    // "hello" → aGVsbG8= (8 chars → ~6 bytes with our 3/4 estimate)
    expect(dataUrlByteLength('data:image/jpeg;base64,aGVsbG8=')).toBe(6);
  });
});

describe('resolveCombatantPortrait', () => {
  const campaign = {
    party: [{ id: 'pc1', portraitDataUrl: 'data:pc' }],
    npcs: [
      {
        id: 'n1',
        portraitDataUrl: 'data:npc',
        statBlock: { portraitDataUrl: 'data:block-npc' },
      },
      {
        id: 'n2',
        statBlock: { portraitDataUrl: 'data:block-only' },
      },
    ],
  };

  it('prefers party portrait for PCs', () => {
    expect(
      resolveCombatantPortrait({ sourcePartyMemberId: 'pc1' }, campaign),
    ).toBe('data:pc');
  });

  it('prefers NPC record portrait over embedded block', () => {
    expect(
      resolveCombatantPortrait({ sourceNpcId: 'n1' }, campaign),
    ).toBe('data:npc');
  });

  it('falls back to NPC embedded block portrait', () => {
    expect(
      resolveCombatantPortrait({ sourceNpcId: 'n2' }, campaign),
    ).toBe('data:block-only');
  });

  it('uses combatant stat block for monsters', () => {
    expect(
      resolveCombatantPortrait(
        { statBlock: { portraitDataUrl: 'data:monster' } },
        campaign,
      ),
    ).toBe('data:monster');
  });
});
