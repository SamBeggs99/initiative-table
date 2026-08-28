import { useState } from 'react';
import {
  blankClock,
  blankCounter,
  CLOCK_SEGMENT_OPTIONS,
} from '../lib/trackers';
import { selectActiveTrackers, useStore } from '../store';
import type { Tracker } from '../types';
import { Sprig, VineRule } from './ornament/Botanical';

const COLORS = ['#a78bfa', '#3d9cf0', '#3ecf8e', '#e85d5d', '#d4a017'] as const;

function ClockSegments({
  tracker,
  onSet,
}: {
  tracker: Tracker;
  onSet: (value: number) => void;
}) {
  const max = tracker.max ?? 6;
  const color = tracker.color ?? '#a78bfa';
  return (
    <div className="mt-2 flex gap-1" role="group" aria-label={`${tracker.name} segments`}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          className="h-2.5 flex-1 rounded-full border border-border/60 transition-all duration-150 hover:scale-y-125"
          style={{
            backgroundColor: i < tracker.value ? color : 'transparent',
            boxShadow:
              i < tracker.value ? `0 0 8px -2px ${color}` : undefined,
          }}
          onClick={() => onSet(i < tracker.value ? i : i + 1)}
          aria-label={`Set ${tracker.name} to ${i + 1} of ${max}`}
        />
      ))}
    </div>
  );
}

function TrackerRow({ tracker }: { tracker: Tracker }) {
  const updateTracker = useStore((s) => s.updateTracker);
  const removeTracker = useStore((s) => s.removeTracker);

  return (
    <li className="card card-hover p-2.5 text-sm transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-text">{tracker.name}</span>
            <span
              className={`badge-soft shrink-0 ${
                tracker.kind === 'clock' ? 'badge-condition' : 'badge-accent'
              }`}
            >
              {tracker.kind}
            </span>
          </div>
          <div className="mt-0.5 font-mono-stats text-xs tabular-nums text-muted">
            <span className="text-base font-bold text-text">{tracker.value}</span>
            {tracker.max != null ? `/${tracker.max}` : ''}
            {` · ${tracker.scope}`}
            {tracker.autoTick
              ? ` · auto ${tracker.autoTick === 'round-end' ? 'end' : 'start'}`
              : ''}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="btn btn-sm font-mono-stats"
            onClick={() =>
              updateTracker(tracker.id, {
                value: Math.max(0, tracker.value - 1),
              })
            }
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-sm font-mono-stats"
            onClick={() =>
              updateTracker(tracker.id, {
                value:
                  tracker.max != null
                    ? Math.min(tracker.max, tracker.value + 1)
                    : tracker.value + 1,
              })
            }
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost hover:text-damage"
            onClick={() => removeTracker(tracker.id)}
            aria-label={`Remove ${tracker.name}`}
          >
            ×
          </button>
        </div>
      </div>
      {tracker.kind === 'clock' && (
        <ClockSegments
          tracker={tracker}
          onSet={(value) => updateTracker(tracker.id, { value })}
        />
      )}
    </li>
  );
}

function NewTrackerForm({ onClose }: { onClose: () => void }) {
  const addTracker = useStore((s) => s.addTracker);
  const [kind, setKind] = useState<'counter' | 'clock'>('clock');
  const [name, setName] = useState('');
  const [segments, setSegments] =
    useState<(typeof CLOCK_SEGMENT_OPTIONS)[number]>(6);
  const [scope, setScope] = useState<'encounter' | 'campaign'>('encounter');
  const [autoTick, setAutoTick] = useState<
    'round-start' | 'round-end' | null
  >('round-end');
  const [color, setColor] = useState<string>(COLORS[0]);

  return (
    <div className="card mb-2 space-y-2 p-2.5 text-xs">
      <div className="flex gap-1">
        <button
          type="button"
          className={`btn btn-sm ${kind === 'clock' ? 'btn-on' : 'text-muted'}`}
          onClick={() => {
            setKind('clock');
            setScope('encounter');
            setAutoTick('round-end');
          }}
        >
          Clock
        </button>
        <button
          type="button"
          className={`btn btn-sm ${kind === 'counter' ? 'btn-accent' : 'text-muted'}`}
          onClick={() => {
            setKind('counter');
            setScope('campaign');
            setAutoTick(null);
          }}
        >
          Counter
        </button>
      </div>
      <input
        className="field w-full text-xs"
        placeholder={kind === 'clock' ? 'Ritual, alarm…' : 'Gold, XP, standing…'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {kind === 'clock' && (
        <>
          <label className="flex items-center gap-2 text-muted">
            Segments
            <select
              className="field px-1.5 py-0.5 text-xs"
              value={segments}
              onChange={(e) =>
                setSegments(Number(e.target.value) as (typeof CLOCK_SEGMENT_OPTIONS)[number])
              }
            >
              {CLOCK_SEGMENT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-muted">
            Auto-tick
            <select
              className="field px-1.5 py-0.5 text-xs"
              value={autoTick ?? ''}
              onChange={(e) =>
                setAutoTick(
                  (e.target.value || null) as 'round-start' | 'round-end' | null,
                )
              }
            >
              <option value="round-end">Round end</option>
              <option value="round-start">Round start</option>
              <option value="">Manual only</option>
            </select>
          </label>
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`h-5 w-5 rounded-full border ${
                  color === c ? 'border-text' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-muted">
        Scope
        <select
          className="field px-1.5 py-0.5 text-xs"
          value={scope}
          onChange={(e) => setScope(e.target.value as 'encounter' | 'campaign')}
        >
          <option value="encounter">Encounter (clears on end)</option>
          <option value="campaign">Campaign (persists)</option>
        </select>
      </label>
      <div className="flex justify-end gap-1">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            const label = name.trim() || (kind === 'clock' ? 'Clock' : 'Counter');
            if (kind === 'clock') {
              addTracker({
                ...blankClock(label, segments),
                scope,
                autoTick,
                color,
              });
            } else {
              addTracker({ ...blankCounter(label), scope, autoTick: null });
            }
            onClose();
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function TrackersPanel() {
  const trackers = useStore(selectActiveTrackers);
  const [creating, setCreating] = useState(false);

  return (
    <section className="shrink-0 border-b border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="section-title section-title-leaf">Trackers</h2>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? 'Close' : '+ Add'}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        Counters and clocks you set by hand — the app never rolls these. Clocks with
        auto-tick advance when the round does.
      </p>
      <VineRule className="my-2" />

      {creating && <NewTrackerForm onClose={() => setCreating(false)} />}

      {trackers.length === 0 && !creating ? (
        <div className="flex items-start gap-2 text-xs text-muted">
          <Sprig />
          <p>
            Add a clock for rituals / alarms, or a campaign counter for gold, XP,
            standing. Also:{' '}
            <span className="font-mono-stats">Ctrl+K → clock ritual 6</span>
          </p>
        </div>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-auto">
          {trackers.map((t) => (
            <TrackerRow key={t.id} tracker={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
