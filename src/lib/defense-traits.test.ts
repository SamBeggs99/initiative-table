import { describe, expect, it } from 'vitest';
import {
  formatDefenseTokenLabel,
  parseDefenseTraits,
} from './defense-traits';

describe('parseDefenseTraits', () => {
  it('splits a simple comma list', () => {
    expect(parseDefenseTraits('cold, lightning, necrotic')).toEqual([
      {
        tokens: [
          { name: 'cold' },
          { name: 'lightning' },
          { name: 'necrotic' },
        ],
      },
    ]);
  });

  it('keeps a trailing comma from inventing an empty chip', () => {
    expect(parseDefenseTraits('fire,')).toEqual([
      { tokens: [{ name: 'fire' }] },
    ]);
  });

  it('groups semicolon segments and 5e nonmagical qualifiers', () => {
    expect(
      parseDefenseTraits(
        'lightning, thunder; bludgeoning, piercing, and slashing from nonmagical attacks',
      ),
    ).toEqual([
      { tokens: [{ name: 'lightning' }, { name: 'thunder' }] },
      {
        tokens: [
          { name: 'bludgeoning' },
          { name: 'piercing' },
          { name: 'slashing' },
        ],
        qualifier: 'from nonmagical attacks',
      },
    ]);
  });

  it('leaves PF2e parentheticals on the token', () => {
    expect(
      parseDefenseTraits('physical 5 (except adamantine), fire 10'),
    ).toEqual([
      {
        tokens: [
          { name: 'physical 5 (except adamantine)' },
          { name: 'fire 10' },
        ],
      },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(parseDefenseTraits(undefined)).toEqual([]);
    expect(parseDefenseTraits('  ')).toEqual([]);
  });
});

describe('formatDefenseTokenLabel', () => {
  it('capitalizes the first letter', () => {
    expect(formatDefenseTokenLabel('fire')).toBe('Fire');
    expect(formatDefenseTokenLabel('bludgeoning')).toBe('Bludgeoning');
  });
});
