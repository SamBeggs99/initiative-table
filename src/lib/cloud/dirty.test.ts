import { describe, expect, it } from 'vitest';
import { notifyCloudDirty, onCloudDirty } from './dirty';

describe('notifyCloudDirty', () => {
  it('calls subscribers and unsubscribes', () => {
    let n = 0;
    const off = onCloudDirty(() => {
      n += 1;
    });
    notifyCloudDirty();
    expect(n).toBe(1);
    off();
    notifyCloudDirty();
    expect(n).toBe(1);
  });
});
