import { describe, expect, it } from 'vitest';
import { formatSpeedField, parseSpeedField } from './speed-field';

describe('speed field', () => {
  it('round-trips walk and fly', () => {
    expect(formatSpeedField({ walk: 30, fly: 60 })).toBe('walk=30,fly=60');
    expect(parseSpeedField('walk=30,fly=60')).toEqual({ walk: 30, fly: 60 });
    expect(parseSpeedField('fly=30, walk=30')).toEqual({ fly: 30, walk: 30 });
  });

  it('keeps a trailing comma from wiping the typed separator', () => {
    expect(parseSpeedField('fly=30,')).toEqual({ fly: 30 });
    expect(parseSpeedField('fly=30,walk')).toEqual({ fly: 30 });
    expect(parseSpeedField('fly=30,walk=')).toEqual({ fly: 30, walk: '' });
  });

  it('parses JSON and leaves incomplete JSON alone', () => {
    expect(parseSpeedField('{"walk":30,"fly":60}')).toEqual({
      walk: 30,
      fly: 60,
    });
    expect(parseSpeedField('{"walk":')).toBeNull();
    expect(parseSpeedField('')).toEqual({});
  });
});
