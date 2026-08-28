import { describe, expect, it } from 'vitest';
import {
  duplicateEncounter,
  filterEncounters,
  scaleEncounter,
  systemGateReason,
  addCreatureEntry,
  setCreatureEntryQuantity,
  removeCreatureEntry,
  blankEncounter,
  type EncounterFilters,
} from './encounter-library';
import { sessionLogToMarkdown } from './session-log';
import { parseCampaignImport, exportCampaignPayload } from './campaign-io';
import type { NpcRecord, SavedEncounter } from '../types';
import { createCombatant } from '../types';
import { blankPartyMember } from './party';
import { hiddenHpLabel } from './combat';

function enc(partial: Partial<SavedEncounter> & Pick<SavedEncounter, 'name' | 'system'>): SavedEncounter {
  return {
    id: crypto.randomUUID(),
    campaignTags: [],
    entries: [],
    npcIds: [],
    trackerPresets: [],
    loot: [],
    notes: '',
    createdAt: Date.now(),
    timesRun: 0,
    ...partial,
  };
}

describe('filterEncounters', () => {
  const list = [
    enc({ name: 'Uldir corridor', system: 'dnd5e', campaignTags: ['Uldir'], timesRun: 0 }),
    enc({ name: 'Dock ambush', system: 'dnd5e', campaignTags: ['Solamento'], timesRun: 2 }),
    enc({ name: 'Shadow ritual', system: 'pf2e', campaignTags: ['Uldir'], timesRun: 0 }),
  ];

  it('defaults to campaign tag and never-run filter', () => {
    const filters: EncounterFilters = {
      query: '',
      system: 'all',
      campaignTag: 'Uldir',
      showAllTags: false,
      difficulty: 'all',
      neverRun: true,
    };
    const found = filterEncounters(list, filters);
    expect(found.map((e) => e.name).sort()).toEqual(['Shadow ritual', 'Uldir corridor']);
  });

  it('show all clears tag filter', () => {
    const filters: EncounterFilters = {
      query: '',
      system: 'dnd5e',
      campaignTag: 'Uldir',
      showAllTags: true,
      difficulty: 'all',
      neverRun: false,
    };
    expect(filterEncounters(list, filters)).toHaveLength(2);
  });
});

describe('system gate + scale', () => {
  it('blocks cross-system load with a reason', () => {
    const e = enc({ name: 'X', system: 'pf2e' });
    expect(systemGateReason(e, 'dnd5e')).toMatch(/cannot load/i);
    expect(systemGateReason(e, 'pf2e')).toBeNull();
  });

  it('scales quantities and duplicates reset run stats', () => {
    const e = enc({
      name: 'Ambush',
      system: 'dnd5e',
      entries: [
        { creatureId: 'a', nameSnapshot: 'Goblin', quantity: 4 },
      ],
      timesRun: 3,
      lastRunAt: 1,
    });
    const scaled = scaleEncounter(e, 2);
    expect(scaled.entries[0]!.quantity).toBe(8);
    const copy = duplicateEncounter(e);
    expect(copy.timesRun).toBe(0);
    expect(copy.lastRunAt).toBeUndefined();
    expect(copy.name).toContain('copy');
  });
});

describe('session log + campaign IO', () => {
  it('exports markdown with events', () => {
    const md = sessionLogToMarkdown(
      [
        { id: '1', at: Date.now(), message: 'Goblin dies', kind: 'damage' },
        { id: '2', at: Date.now(), message: 'Clock ritual → 6/6', kind: 'system' },
      ],
      { campaignName: 'Uldir', sessionNumber: 4 },
    );
    expect(md).toContain('# Session log');
    expect(md).toContain('Goblin dies');
    expect(md).toContain('Clock ritual');
  });

  it('round-trips campaign export JSON', () => {
    const payload = exportCampaignPayload({
      id: 'c1',
      name: 'Solamento',
      system: 'dnd5e',
      party: [],
      npcs: [],
      trackers: [],
      notes: '',
      lastOpened: Date.now(),
      sessionNumber: 3,
    });
    const parsed = parseCampaignImport(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.campaign.name).toBe('Solamento');
      expect(parsed.payload.campaign.id).not.toBe('c1');
    }
  });

  it('re-points imported combatants and relationships at the new roster ids', () => {
    const member = { ...blankPartyMember('c1'), id: 'p1', name: 'Aria' };
    const npc: NpcRecord = {
      id: 'n1',
      name: 'Ireena',
      kind: 'character',
      tags: [],
      notes: '',
      relationships: [{ partyMemberId: 'p1', note: 'owes a favour' }],
    };
    const payload = exportCampaignPayload(
      {
        id: 'c1',
        name: 'Solamento',
        system: 'dnd5e',
        party: [member],
        npcs: [npc],
        trackers: [],
        notes: '',
        lastOpened: Date.now(),
        sessionNumber: 1,
      },
      {
        round: 2,
        turnIndex: 0,
        started: true,
        combatants: [
          createCombatant({ name: 'Aria', kind: 'pc', sourcePartyMemberId: 'p1' }),
          createCombatant({ name: 'Ireena', kind: 'npc', sourceNpcId: 'n1' }),
          createCombatant({ name: 'Goblin', kind: 'npc' }),
        ],
        loot: [],
      },
    );

    const parsed = parseCampaignImport(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const newPartyId = parsed.payload.campaign.party[0].id;
    const newNpcId = parsed.payload.campaign.npcs[0].id;
    expect(newPartyId).not.toBe('p1');
    expect(parsed.payload.campaign.party[0].campaignId).toBe(
      parsed.payload.campaign.id,
    );
    expect(
      parsed.payload.campaign.npcs[0].relationships?.[0].partyMemberId,
    ).toBe(newPartyId);

    const combatants = parsed.payload.combat?.combatants ?? [];
    expect(combatants[0].sourcePartyMemberId).toBe(newPartyId);
    expect(combatants[1].sourceNpcId).toBe(newNpcId);
    expect(combatants[2].sourcePartyMemberId).toBeUndefined();
  });

  it('drops NPC relationships that no longer resolve after import', () => {
    const npc: NpcRecord = {
      id: 'n1',
      name: 'Ireena',
      kind: 'character',
      tags: [],
      notes: '',
      relationships: [{ partyMemberId: 'ghost', note: 'orphan link' }],
    };
    const payload = exportCampaignPayload({
      id: 'c1',
      name: 'Solamento',
      system: 'dnd5e',
      party: [],
      npcs: [npc],
      trackers: [],
      notes: '',
      lastOpened: Date.now(),
      sessionNumber: 1,
    });
    const parsed = parseCampaignImport(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.campaign.npcs[0]?.relationships ?? []).toEqual([]);
  });
});

describe('Hide HP labels', () => {
  it('shows Healthy / Bloodied / Badly bloodied', () => {
    expect(hiddenHpLabel({ hp: 40, maxHp: 40 })).toBe('Healthy');
    expect(hiddenHpLabel({ hp: 20, maxHp: 40 })).toBe('Bloodied');
    expect(hiddenHpLabel({ hp: 8, maxHp: 40 })).toBe('Badly bloodied');
    expect(hiddenHpLabel({ hp: 0, maxHp: 40 })).toBe('Dead');
  });
});

describe('encounter builder entries', () => {
  it('creates a blank pack and stacks quantities by creature id', () => {
    let e = blankEncounter('dnd5e', 'Goblin picket', ['Uldir']);
    e = addCreatureEntry(e, { id: 'gob', name: 'Goblin' }, 2);
    e = addCreatureEntry(e, { id: 'gob', name: 'Goblin' }, 1);
    e = addCreatureEntry(e, { id: 'wolf', name: 'Wolf' }, 1);
    expect(e.entries).toEqual([
      { creatureId: 'gob', nameSnapshot: 'Goblin', quantity: 3 },
      { creatureId: 'wolf', nameSnapshot: 'Wolf', quantity: 1 },
    ]);
  });

  it('sets and removes quantities', () => {
    let e = blankEncounter('dnd5e', 'Test', []);
    e = addCreatureEntry(e, { id: 'gob', name: 'Goblin' }, 4);
    e = setCreatureEntryQuantity(e, 'gob', 2);
    expect(e.entries[0]?.quantity).toBe(2);
    e = setCreatureEntryQuantity(e, 'gob', 0);
    expect(e.entries).toHaveLength(0);
    e = addCreatureEntry(e, { id: 'gob', name: 'Goblin' }, 1);
    e = removeCreatureEntry(e, 'gob');
    expect(e.entries).toHaveLength(0);
  });

  it('ignores non-finite quantity edits', () => {
    let e = blankEncounter('dnd5e', 'Test', []);
    e = addCreatureEntry(e, { id: 'gob', name: 'Goblin' }, 2);
    const same = setCreatureEntryQuantity(e, 'gob', Number.NaN);
    expect(same.entries[0]?.quantity).toBe(2);
  });
});
