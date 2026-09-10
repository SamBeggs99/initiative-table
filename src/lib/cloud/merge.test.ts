import { describe, expect, it } from 'vitest';
import { decideSync, type SyncDecisionInput } from './merge';

const base: SyncDecisionInput = {
  localDirtySince: null,
  lastSyncedAt: '2026-01-01T10:00:00.000Z',
  remoteUpdatedAt: '2026-01-01T10:00:00.000Z',
  remoteEmpty: false,
  localEmpty: false,
};

const decide = (patch: Partial<SyncDecisionInput>) =>
  decideSync({ ...base, ...patch }).kind;

describe('decideSync', () => {
  it('seeds an empty cloud row from this device', () => {
    expect(decide({ remoteEmpty: true, remoteUpdatedAt: null })).toBe('push');
  });

  it('seeds an empty cloud row even when this device is also empty', () => {
    expect(
      decide({ remoteEmpty: true, remoteUpdatedAt: null, localEmpty: true }),
    ).toBe('push');
  });

  it('pulls onto a fresh device', () => {
    expect(decide({ localEmpty: true, lastSyncedAt: null })).toBe('pull');
  });

  it('does nothing when both sides are where we left them', () => {
    expect(decide({})).toBe('noop');
  });

  it('pulls when another device advanced the cloud and we have no local edits', () => {
    expect(decide({ remoteUpdatedAt: '2026-01-01T12:00:00.000Z' })).toBe('pull');
  });

  it('pushes local work when the cloud has not moved', () => {
    expect(decide({ localDirtySince: Date.parse('2026-01-01T11:00:00Z') })).toBe(
      'push',
    );
  });

  // The regression this module exists for: a session run with the lid closed
  // before the push landed, reopened after another device wrote the cloud.
  it('asks when both this device and the cloud moved', () => {
    expect(
      decide({
        localDirtySince: Date.parse('2026-01-01T11:00:00Z'),
        remoteUpdatedAt: '2026-01-01T12:00:00.000Z',
      }),
    ).toBe('conflict');
  });

  it('asks on a first sign-in that would overwrite real local work', () => {
    expect(
      decide({
        lastSyncedAt: null,
        localDirtySince: Date.parse('2026-01-01T11:00:00Z'),
      }),
    ).toBe('conflict');
  });

  it('never silently discards local work', () => {
    const dirty = Date.parse('2026-01-01T11:00:00Z');
    for (const lastSyncedAt of [null, '2026-01-01T09:00:00.000Z']) {
      for (const remoteUpdatedAt of [
        '2026-01-01T09:00:00.000Z',
        '2026-01-01T12:00:00.000Z',
      ]) {
        const decision = decideSync({
          ...base,
          localDirtySince: dirty,
          lastSyncedAt,
          remoteUpdatedAt,
        });
        expect(decision.kind).not.toBe('pull');
      }
    }
  });
});
