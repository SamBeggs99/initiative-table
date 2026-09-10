import { beforeEach, describe, expect, it } from 'vitest';
import { bestiaryDb } from '../bestiary/db';
import { putPortrait } from '../portrait-store';
import { useStore } from '../../store';
import {
  applyPortraitPayload,
  buildPortraitPayload,
  referencedPortraitIds,
} from './portraits';
import type { Campaign } from '../../types';

const jpeg = (bytes: number[]) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });

function campaignWith(patch: Partial<Campaign>): Campaign {
  return {
    id: 'c1',
    name: 'Solamento',
    system: 'dnd5e',
    sessionNumber: 1,
    lastOpened: 0,
    party: [],
    npcs: [],
    trackers: [],
    sessionNotes: [],
    ...patch,
  } as Campaign;
}

beforeEach(async () => {
  await bestiaryDb.portraits.clear();
  await bestiaryDb.creatures.clear();
  useStore.setState({ campaigns: [], combatByCampaign: {} });
});

describe('referencedPortraitIds', () => {
  it('collects ids from party sheets, NPCs, and their stat blocks', async () => {
    useStore.setState({
      campaigns: [
        campaignWith({
          party: [{ id: 'p1', portraitId: 'sha256-pc' }] as Campaign['party'],
          npcs: [
            { id: 'n1', portraitId: 'sha256-npc' },
            { id: 'n2', statBlock: { portraitId: 'sha256-block' } },
          ] as Campaign['npcs'],
        }),
      ],
    });
    const ids = await referencedPortraitIds();
    expect([...ids].sort()).toEqual([
      'sha256-block',
      'sha256-npc',
      'sha256-pc',
    ]);
  });

  it('includes portraits referenced only by the live tape', async () => {
    useStore.setState({
      campaigns: [campaignWith({})],
      combatByCampaign: {
        c1: {
          round: 1,
          turnIndex: 0,
          started: true,
          loot: [],
          combatants: [
            { id: 'x', statBlock: { portraitId: 'sha256-onTape' } },
          ] as never,
        },
      },
    });
    expect([...(await referencedPortraitIds())]).toContain('sha256-onTape');
  });

  it('includes homebrew creature portraits but not synced ones', async () => {
    await bestiaryDb.creatures.bulkPut([
      {
        id: 'h1',
        origin: 'homebrew',
        system: 'dnd5e',
        slug: 'h1',
        name: 'Mine',
        portraitId: 'sha256-homebrew',
      },
      {
        id: 's1',
        origin: 'synced',
        system: 'dnd5e',
        slug: 's1',
        name: 'Theirs',
        portraitId: 'sha256-synced',
      },
    ] as never);

    const ids = await referencedPortraitIds();
    expect(ids.has('sha256-homebrew')).toBe(true);
    // Catalog art is a per-device download, not account data.
    expect(ids.has('sha256-synced')).toBe(false);
  });

  it('is empty when nothing references a portrait', async () => {
    useStore.setState({ campaigns: [campaignWith({})] });
    expect((await referencedPortraitIds()).size).toBe(0);
  });
});

describe('payload round trip', () => {
  it('uploads only referenced portraits', async () => {
    const used = await putPortrait(jpeg([1, 2, 3]));
    await putPortrait(jpeg([9, 9, 9])); // orphan from a deleted NPC

    useStore.setState({
      campaigns: [
        campaignWith({
          party: [{ id: 'p1', portraitId: used }] as Campaign['party'],
        }),
      ],
    });

    const payload = await buildPortraitPayload();
    expect(payload.map((p) => p.id)).toEqual([used]);
  });

  it('restores bytes byte-for-byte on another device', async () => {
    const id = await putPortrait(jpeg([5, 10, 200, 255, 0]));
    useStore.setState({
      campaigns: [
        campaignWith({
          party: [{ id: 'p1', portraitId: id }] as Campaign['party'],
        }),
      ],
    });
    const payload = await buildPortraitPayload();

    // Simulate the second device: empty store, apply what the cloud sent.
    await bestiaryDb.portraits.clear();
    expect(await applyPortraitPayload(payload)).toBe(1);

    const row = await bestiaryDb.portraits.get(id);
    expect(row).toBeDefined();
    expect([...new Uint8Array(await row!.blob.arrayBuffer())]).toEqual([
      5, 10, 200, 255, 0,
    ]);
    expect(row!.blob.type).toBe('image/jpeg');
  });

  it('does not overwrite a portrait this device already has', async () => {
    const id = await putPortrait(jpeg([1, 1, 1]));
    const written = await applyPortraitPayload([
      { id, b64: btoa(''), type: 'image/jpeg' },
    ]);
    expect(written).toBe(0);
    const row = await bestiaryDb.portraits.get(id);
    expect([...new Uint8Array(await row!.blob.arrayBuffer())]).toEqual([1, 1, 1]);
  });

  it('skips malformed entries rather than failing the whole pull', async () => {
    const good = await putPortrait(jpeg([7]));
    await bestiaryDb.portraits.clear();
    const written = await applyPortraitPayload([
      { id: 'sha256-bad', b64: 'not!valid!base64', type: 'image/jpeg' },
      { nonsense: true },
      null,
      { id: good, b64: btoa(''), type: 'image/jpeg' },
    ]);
    expect(written).toBe(1);
  });

  it('tolerates a row with no portraits column', async () => {
    expect(await applyPortraitPayload(undefined)).toBe(0);
    expect(await applyPortraitPayload(null)).toBe(0);
    expect(await applyPortraitPayload('nope')).toBe(0);
  });
});
