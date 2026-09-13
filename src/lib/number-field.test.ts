import { describe, expect, it } from 'vitest';

/**
 * The leading-zero rule, mirrored here as a pure function.
 *
 * The bug: `<input type="number">` under React decides whether to rewrite the
 * DOM with **loose** equality — `node.value != value`. `"01" == 1` is true, so
 * a field sitting at 0 with a digit typed after it reads `01` forever while
 * state says `1`. The fix moved every numeric input to `type="text"` with the
 * text held locally; this is the normalisation that runs as you type.
 */
function stripLeadingZeros(raw: string): string {
  return raw.replace(/^([+-]?)0+(?=\d)/, '$1');
}

describe('stripLeadingZeros', () => {
  it('removes the zero once a real digit lands behind it', () => {
    // The reported case, exactly.
    expect(stripLeadingZeros('01')).toBe('1');
    expect(stripLeadingZeros('06')).toBe('6');
    expect(stripLeadingZeros('007')).toBe('7');
    expect(stripLeadingZeros('0012')).toBe('12');
  });

  it('leaves a lone zero alone — 0 is a legitimate value', () => {
    expect(stripLeadingZeros('0')).toBe('0');
    expect(stripLeadingZeros('')).toBe('');
  });

  it('collapses a run of zeros to one', () => {
    expect(stripLeadingZeros('00')).toBe('0');
    expect(stripLeadingZeros('000')).toBe('0');
  });

  it('keeps the sign and strips behind it', () => {
    expect(stripLeadingZeros('-01')).toBe('-1');
    expect(stripLeadingZeros('-007')).toBe('-7');
    expect(stripLeadingZeros('-0')).toBe('-0');
    expect(stripLeadingZeros('-')).toBe('-');
  });

  it('does not eat the zero of a decimal', () => {
    expect(stripLeadingZeros('0.5')).toBe('0.5');
    expect(stripLeadingZeros('-0.25')).toBe('-0.25');
  });

  it('leaves ordinary numbers untouched', () => {
    for (const n of ['1', '12', '345', '-6', '10', '100', '20']) {
      expect(stripLeadingZeros(n)).toBe(n);
    }
  });

  it('never changes what the string means numerically', () => {
    for (const raw of ['01', '007', '0', '00', '-01', '0.5', '10', '-0.25']) {
      expect(Number(stripLeadingZeros(raw))).toBe(Number(raw));
    }
  });
});
