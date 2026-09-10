import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStorage } from './test/setup';
import {
  applyPersistSlice,
  currentEditSeq,
  getPersistSlice,
  resetQuotaWarning,
  useStore,
} from './store';
import { createCombatant, emptyCombatState } from './types';

/**
 * Session-lifecycle coverage. The pure libs are well tested individually; these
 * drive the store the way a fight does, because the failures that actually cost
 * a DM their session live in the wiring between those libs — HP write-back,
 * turn advance, and the sync bookkeeping that decides whether the cloud is
 * allowed to overwrite this device.
 */

function freshStore() {
  useStore.setState({
    campaigns: [],
    activeCampaignId: null,
    encounters: [],
    combatByCampaign: {},
    log: [],
    undoStack: [],
    toasts: [],
    concentrationPrompt: null,
    initiativePromptOpen: false,
    cloudMeta: { dirtySince: null, lastSyncedAt: null },
    storageBlocked: null,
  });
  // The reset itself changes persisted keys, which marks the device dirty.
  useStore.getState().markCloudSynced(null);
}

function seatCampaign(name = 'Solamento') {
  const id = useStore.getState().createCampaign(name);
  useStore.getState().setActiveCampaign(id);
  return id;
}

function addMonster(name: string, hp: number) {
  const c = createCombatant({ name, kind: 'npc', hp, maxHp: hp, ac: 13 });
  useStore.getState().addCombatant(c);
  return c.id;
}

const combat = () => useStore.getState().getActiveCombat();
const byName = (name: string) =>
  combat().combatants.find((c) => c.name === name);

beforeEach(() => {
  memoryStorage.clear();
  memoryStorage.quotaAfterBytes = Number.POSITIVE_INFINITY;
  resetQuotaWarning();
  freshStore();
});

describe('a fight, start to finish', () => {
  it('seats the party, runs rounds, and writes HP back on end fight', () => {
    seatCampaign();
    const pcId = useStore.getState().createBlankPartyMember('Vera');
    // Sheet max and live HP are separate on purpose — raising max does not heal.
    useStore.getState().patchPartySheet(pcId, { maxHp: 30 });
    useStore.getState().patchPartyLive(pcId, { currentHp: 30 });
    useStore.getState().syncPartyToTape();

    const ogre = addMonster('Ogre', 59);
    useStore.getState().startCombat();

    expect(combat().started).toBe(true);
    expect(combat().round).toBe(1);

    useStore.getState().applyDamage(ogre, 12);
    expect(byName('Ogre')?.hp).toBe(47);

    // Round the tape until the round counter ticks.
    const count = combat().combatants.length;
    for (let i = 0; i < count; i++) useStore.getState().nextTurn();
    expect(combat().round).toBe(2);

    const pcRow = combat().combatants.find(
      (c) => c.sourcePartyMemberId === pcId,
    );
    expect(pcRow).toBeDefined();
    useStore.getState().applyDamage(pcRow!.id, 11);

    useStore.getState().endCombat();

    // Live HP lands on the sheet; sheet max is untouched.
    const member = useStore
      .getState()
      .getActiveCampaign()!
      .party.find((p) => p.id === pcId)!;
    expect(member.maxHp).toBe(30);
    expect(member.currentHp).toBe(19);

    // Party stays on the tape between fights, enemies do not.
    expect(byName('Ogre')).toBeUndefined();
    expect(
      combat().combatants.some((c) => c.sourcePartyMemberId === pcId),
    ).toBe(true);
    expect(combat().started).toBe(false);
  });

  it('undoes the last HP change without touching the rest of the tape', () => {
    seatCampaign();
    const a = addMonster('Goblin A', 7);
    const b = addMonster('Goblin B', 7);
    useStore.getState().applyDamage(a, 3);
    useStore.getState().applyDamage(b, 5);

    useStore.getState().undoLast();
    expect(byName('Goblin B')?.hp).toBe(7);
    expect(byName('Goblin A')?.hp).toBe(4);

    useStore.getState().undoLast();
    expect(byName('Goblin A')?.hp).toBe(7);
  });

  it('keeps a fight in progress out of another campaign', () => {
    const first = seatCampaign('Solamento');
    addMonster('Ogre', 59);
    const second = seatCampaign('Uldir');
    expect(combat().combatants).toHaveLength(0);

    useStore.getState().setActiveCampaign(first);
    expect(byName('Ogre')?.hp).toBe(59);
    expect(second).not.toBe(first);
  });

  it('clears the encounter without writing tape HP back to the sheet', () => {
    seatCampaign();
    const pcId = useStore.getState().createBlankPartyMember('Vera');
    useStore.getState().patchPartySheet(pcId, { maxHp: 30 });
    useStore.getState().syncPartyToTape();

    const sheetHp = () =>
      useStore
        .getState()
        .getActiveCampaign()!
        .party.find((p) => p.id === pcId)!.currentHp;
    const before = sheetHp();

    const row = combat().combatants.find((c) => c.sourcePartyMemberId === pcId)!;
    useStore.getState().applyDamage(row.id, 5);
    expect(combat().combatants.find((c) => c.id === row.id)!.hp).toBe(
      row.hp - 5,
    );

    // Clear is the "that didn't happen" exit — the tape is wiped and the sheet
    // must not inherit the damage, unlike End fight.
    useStore.getState().clearEncounter();
    expect(sheetHp()).toBe(before);
  });
});

describe('sync bookkeeping', () => {
  it('marks the device dirty on the first campaign change and not before', () => {
    expect(useStore.getState().cloudMeta.dirtySince).toBeNull();
    seatCampaign();
    expect(useStore.getState().cloudMeta.dirtySince).not.toBeNull();
  });

  it('does not mark dirty for log or toast churn', () => {
    seatCampaign();
    useStore.getState().markCloudSynced('2026-01-01T00:00:00.000Z');
    expect(useStore.getState().cloudMeta.dirtySince).toBeNull();

    useStore.getState().pushLog('Ogre swings', 'info');
    useStore.getState().pushToast('rolled 14');
    expect(useStore.getState().cloudMeta.dirtySince).toBeNull();
  });

  it('advances the edit sequence per campaign change', () => {
    const before = currentEditSeq();
    seatCampaign();
    addMonster('Ogre', 59);
    expect(currentEditSeq()).toBeGreaterThan(before);
  });

  it('keeps the device dirty when an edit lands mid-upload', () => {
    seatCampaign();
    const seqAtPush = currentEditSeq();
    addMonster('Ogre', 59); // the edit that lands while the upload is in flight
    useStore.getState().markCloudSynced('2026-01-01T00:00:00.000Z', seqAtPush);
    expect(useStore.getState().cloudMeta.dirtySince).not.toBeNull();
  });

  it('clears dirty when the pushed payload was current', () => {
    seatCampaign();
    const seq = currentEditSeq();
    useStore.getState().markCloudSynced('2026-01-01T00:00:00.000Z', seq);
    expect(useStore.getState().cloudMeta.dirtySince).toBeNull();
  });

  it('does not treat a cloud pull as a local edit', () => {
    seatCampaign();
    const slice = getPersistSlice(useStore.getState());
    applyPersistSlice(slice, '2026-01-01T00:00:00.000Z');
    expect(useStore.getState().cloudMeta).toEqual({
      dirtySince: null,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('never uploads the local sync markers', () => {
    seatCampaign();
    const slice = getPersistSlice(useStore.getState()) as Record<string, unknown>;
    expect(slice).not.toHaveProperty('cloudMeta');
  });
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('autosave failure is loud, not fatal', () => {
  it('raises a persistent flag when localStorage refuses the write', async () => {
    seatCampaign();
    // Wall off storage, then make a change bigger than the wall.
    memoryStorage.quotaAfterBytes = 10;
    addMonster('Ogre', 59);

    // Flagged on a deferred tick: the flag is itself a store write, and writing
    // from inside a failing write would re-enter the storage adapter.
    await tick();
    expect(useStore.getState().storageBlocked).toBe('full');
  });

  it('does not throw out of a mutation when storage is full', () => {
    seatCampaign();
    memoryStorage.quotaAfterBytes = 10;
    // Zustand's persist propagates a storage error straight out of setState, so
    // an unguarded quota failure made *every* subsequent mutation throw — the
    // fight would stop working, not just stop saving.
    expect(() => addMonster('Ogre', 59)).not.toThrow();
    expect(() => useStore.getState().nextTurn()).not.toThrow();
  });

  it('keeps the in-memory tape correct while storage is blocked', () => {
    seatCampaign();
    memoryStorage.quotaAfterBytes = 10;
    const id = addMonster('Ogre', 59);
    useStore.getState().applyDamage(id, 12);
    // The DM can still finish the fight and export; only the disk copy is stale.
    expect(byName('Ogre')?.hp).toBe(47);
  });

  it('lowers the flag once a write succeeds again', async () => {
    seatCampaign();
    memoryStorage.quotaAfterBytes = 10;
    addMonster('Ogre', 59);
    await tick();
    expect(useStore.getState().storageBlocked).toBe('full');

    memoryStorage.quotaAfterBytes = Number.POSITIVE_INFINITY;
    addMonster('Goblin', 7);
    await tick();
    expect(useStore.getState().storageBlocked).toBeNull();
  });
});

describe('emptyCombatState', () => {
  it('starts idle at round 1', () => {
    const s = emptyCombatState();
    expect(s.round).toBe(1);
    expect(s.started).toBe(false);
    expect(s.combatants).toHaveLength(0);
  });
});
