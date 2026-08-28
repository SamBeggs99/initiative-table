import { describe, expect, it } from 'vitest';
import { double, evaluateTape, half, tapeAmountForApply } from './tape';
import { blankClock, tickTrackers } from './trackers';

describe('evaluateTape', () => {
  it('does plain arithmetic the DM typed', () => {
    expect(evaluateTape('14+3')).toEqual({ ok: true, value: 17 });
    expect(evaluateTape('(20-4)/2')).toEqual({ ok: true, value: 8 });
    expect(evaluateTape('7*2+1')).toEqual({ ok: true, value: 15 });
  });

  it('rejects dice notation — this is not a roller', () => {
    const r = evaluateTape('2d6+3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain('dice');
  });

  it('HALF and DOUBLE match resistance / failed-save use', () => {
    expect(half(17)).toBe(8);
    expect(half(16)).toBe(8);
    expect(double(9)).toBe(18);
  });

  it('apply amount is a non-negative integer', () => {
    expect(tapeAmountForApply(17.9)).toBe(17);
    expect(tapeAmountForApply(-4)).toBe(4);
  });
});

describe('tickTrackers', () => {
  it('advances round-end clocks and flags full', () => {
    const clock = { id: '1', ...blankClock('Ritual', 4), value: 3, autoTick: 'round-end' as const };
    const { trackers, events } = tickTrackers([clock], 'round-end');
    expect(trackers[0]!.value).toBe(4);
    expect(events[0]!.filled).toBe(true);
    expect(events[0]!.message).toContain('full');
  });

  it('ignores clocks without matching autoTick', () => {
    const clock = { id: '1', ...blankClock('Alarm', 6), autoTick: 'round-start' as const };
    const { trackers, events } = tickTrackers([clock], 'round-end');
    expect(trackers[0]!.value).toBe(0);
    expect(events).toHaveLength(0);
  });
});
