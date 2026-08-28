import type { Tracker } from '../types';

export const CLOCK_SEGMENT_OPTIONS = [4, 6, 8] as const;

export type TrackerTickWhen = 'round-start' | 'round-end';

export interface TrackerTickEvent {
  id: string;
  name: string;
  value: number;
  max?: number;
  filled: boolean;
  message: string;
}

/** Advance autoTick clocks/counters for the given phase. */
export function tickTrackers(
  trackers: Tracker[],
  when: TrackerTickWhen,
): { trackers: Tracker[]; events: TrackerTickEvent[] } {
  const events: TrackerTickEvent[] = [];
  const next = trackers.map((t) => {
    if (t.autoTick !== when) return t;
    if (t.kind === 'clock' && t.max != null) {
      if (t.value >= t.max) return t;
      const value = Math.min(t.max, t.value + 1);
      const filled = value >= t.max;
      events.push({
        id: t.id,
        name: t.name,
        value,
        max: t.max,
        filled,
        message: filled
          ? `Clock “${t.name}” is full (${value}/${t.max})`
          : `Clock “${t.name}” → ${value}/${t.max}`,
      });
      return { ...t, value };
    }
    // Counters with autoTick: just increment
    const value = t.value + 1;
    events.push({
      id: t.id,
      name: t.name,
      value,
      max: t.max,
      filled: t.max != null && value >= t.max,
      message: `Counter “${t.name}” → ${value}${t.max != null ? `/${t.max}` : ''}`,
    });
    return { ...t, value };
  });
  return { trackers: next, events };
}

export function blankCounter(name = 'Counter'): Omit<Tracker, 'id'> {
  return {
    name,
    kind: 'counter',
    value: 0,
    scope: 'campaign',
    autoTick: null,
  };
}

export function blankClock(
  name = 'Clock',
  segments: (typeof CLOCK_SEGMENT_OPTIONS)[number] = 6,
): Omit<Tracker, 'id'> {
  return {
    name,
    kind: 'clock',
    value: 0,
    max: segments,
    scope: 'encounter',
    autoTick: 'round-end',
  };
}

/** Drop encounter-scoped trackers (combat ended). */
export function retainCampaignTrackers(trackers: Tracker[]): Tracker[] {
  return trackers.filter((t) => t.scope === 'campaign');
}
