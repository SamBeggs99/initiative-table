import { describe, expect, it } from 'vitest';
import { isCloudBlobEmpty } from './blob-shape';

describe('isCloudBlobEmpty', () => {
  it('treats a missing row as empty', () => {
    expect(isCloudBlobEmpty(null)).toBe(true);
  });

  it('treats an empty blob as empty', () => {
    expect(
      isCloudBlobEmpty({
        store: { campaigns: [], encounters: [] },
        homebrew_creatures: [],
        homebrew_spells: [],
      }),
    ).toBe(true);
  });

  it('is not empty when campaigns exist', () => {
    expect(
      isCloudBlobEmpty({
        store: { campaigns: [{ id: 'c1' }], encounters: [] },
        homebrew_creatures: [],
        homebrew_spells: [],
      }),
    ).toBe(false);
  });

  it('is not empty when only homebrew exists', () => {
    expect(
      isCloudBlobEmpty({
        store: { campaigns: [], encounters: [] },
        homebrew_creatures: [{ id: 'hb' }],
        homebrew_spells: [],
      }),
    ).toBe(false);
  });
});
