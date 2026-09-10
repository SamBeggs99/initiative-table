import { beforeEach, describe, expect, it } from 'vitest';
import { bestiaryDb } from './bestiary/db';
import {
  getPortrait,
  listPortraitIds,
  pruneUnreferencedPortraits,
  putPortrait,
} from './portrait-store';

const jpeg = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });

beforeEach(async () => {
  await bestiaryDb.portraits.clear();
});

describe('content-addressed portrait store', () => {
  it('returns the same id for byte-identical images', async () => {
    const a = await putPortrait(jpeg([1, 2, 3, 4]));
    const b = await putPortrait(jpeg([1, 2, 3, 4]));
    expect(a).toBe(b);
    // The point of content addressing: eight goblins from one bestiary row
    // used to embed eight base64 copies of the same picture.
    expect(await listPortraitIds()).toHaveLength(1);
  });

  it('returns different ids for different images', async () => {
    const a = await putPortrait(jpeg([1, 2, 3, 4]));
    const b = await putPortrait(jpeg([4, 3, 2, 1]));
    expect(a).not.toBe(b);
    expect(await listPortraitIds()).toHaveLength(2);
  });

  it('round-trips the bytes', async () => {
    const id = await putPortrait(jpeg([9, 8, 7]));
    const blob = await getPortrait(id);
    expect(blob).toBeDefined();
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([9, 8, 7]);
  });

  it('records the byte size, not the base64 length', async () => {
    const id = await putPortrait(jpeg(Array.from({ length: 300 }, (_, i) => i % 256)));
    const row = await bestiaryDb.portraits.get(id);
    expect(row?.bytes).toBe(300);
  });

  it('reports nothing for an unknown id', async () => {
    expect(await getPortrait('sha256-nope')).toBeUndefined();
  });
});

describe('pruning', () => {
  it('deletes only the portraits nothing points at', async () => {
    const keep = await putPortrait(jpeg([1]));
    const drop = await putPortrait(jpeg([2]));

    const removed = await pruneUnreferencedPortraits([keep]);
    expect(removed).toBe(1);
    expect(await getPortrait(keep)).toBeDefined();
    expect(await getPortrait(drop)).toBeUndefined();
  });

  it('is a no-op when everything is referenced', async () => {
    const a = await putPortrait(jpeg([1]));
    const b = await putPortrait(jpeg([2]));
    expect(await pruneUnreferencedPortraits([a, b])).toBe(0);
    expect(await listPortraitIds()).toHaveLength(2);
  });

  it('clears the table when nothing is referenced', async () => {
    await putPortrait(jpeg([1]));
    await putPortrait(jpeg([2]));
    expect(await pruneUnreferencedPortraits([])).toBe(2);
    expect(await listPortraitIds()).toHaveLength(0);
  });
});
