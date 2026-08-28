import { describe, expect, it } from 'vitest';
import { withTimeout } from './timeout';

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 'ok', 200)).resolves.toBe(7);
  });

  it('rejects when the work hangs', async () => {
    await expect(
      withTimeout(new Promise(() => {}), 'hung', 20),
    ).rejects.toThrow(/hung timed out/);
  });
});
