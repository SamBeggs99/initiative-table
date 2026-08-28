import { describe, expect, it } from 'vitest';
import { newId } from './uuid';

describe('newId', () => {
  it('returns a UUID-shaped string without needing crypto.randomUUID', () => {
    const id = newId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
