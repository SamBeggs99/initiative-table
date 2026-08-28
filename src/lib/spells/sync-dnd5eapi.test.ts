import { describe, expect, it } from 'vitest';
import { spellDb } from './db';
import { dnd5eApiToSpell, type Dnd5eApiSpell } from './normalize-dnd5eapi';
import {
  DND5EAPI_SPELLS_URL,
  fetchDnd5eApiSpells,
  syncDnd5eApiSpells,
} from './sync-dnd5eapi';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    headers: { 'Content-Type': 'application/json' },
  });
}

const fireball: Dnd5eApiSpell = {
  index: 'fireball',
  name: 'Fireball',
  desc: [
    'A bright streak flashes from your pointing finger.',
    'The fire spreads around corners.',
  ],
  higher_level: [
    'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.',
  ],
  range: '150 feet',
  components: ['V', 'S', 'M'],
  material: 'A tiny ball of bat guano and sulfur.',
  ritual: false,
  duration: 'Instantaneous',
  concentration: false,
  casting_time: '1 action',
  level: 3,
  school: { name: 'Evocation' },
  classes: [{ index: 'sorcerer', name: 'Sorcerer' }, { index: 'wizard', name: 'Wizard' }],
};

const shield: Dnd5eApiSpell = {
  index: 'shield',
  name: 'Shield',
  desc: ['An invisible barrier of magical force appears.'],
  range: 'Self',
  components: ['V', 'S'],
  ritual: false,
  duration: '1 round',
  concentration: false,
  casting_time: '1 reaction',
  level: 1,
  school: { name: 'Abjuration' },
  classes: [{ name: 'Sorcerer' }, { name: 'Wizard' }],
};

describe('dnd5eApiToSpell', () => {
  it('maps SRD fields onto the shared Spell shape with stable ids', () => {
    const spell = dnd5eApiToSpell(fireball, 'synced');
    expect(spell?.id).toBe('dnd5e:wotc-srd:fireball');
    expect(spell?.system).toBe('dnd5e');
    expect(spell?.level).toBe(3);
    expect(spell?.components).toContain('bat guano');
    expect(spell?.classes).toEqual(['sorcerer', 'wizard']);
    expect(spell?.desc).toContain('spreads around corners');
    expect(spell?.higherLevel).toMatch(/1d6/);
    expect(spell?.concentration).toBe(false);
  });

  it('skips entries without a name or index', () => {
    expect(dnd5eApiToSpell({ name: 'Nope' })).toBeNull();
    expect(dnd5eApiToSpell({ index: 'nope' })).toBeNull();
  });
});

describe('fetchDnd5eApiSpells', () => {
  it('loads the index then fetches each spell', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url === DND5EAPI_SPELLS_URL) {
        return jsonResponse({
          count: 2,
          results: [
            { index: 'fireball', url: '/api/2014/spells/fireball' },
            { index: 'shield', url: '/api/2014/spells/shield' },
          ],
        });
      }
      if (url.endsWith('/fireball')) return jsonResponse(fireball);
      if (url.endsWith('/shield')) return jsonResponse(shield);
      return jsonResponse({ error: 'missing' }, 404);
    };

    const spells = await fetchDnd5eApiSpells(undefined, {
      fetchImpl,
      concurrency: 2,
    });
    expect(spells.map((s) => s.name)).toEqual(['Fireball', 'Shield']);
    expect(urls).toHaveLength(3);
  });

  it('surfaces API error text on 400', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ error: 'nope' }, 400);

    await expect(
      fetchDnd5eApiSpells(undefined, { fetchImpl }),
    ).rejects.toThrow(/nope/);
  });
});

describe('syncDnd5eApiSpells', () => {
  it('writes synced SRD spells and leaves homebrew alone', async () => {
    await spellDb.spells.clear();
    await spellDb.spellsStaging.clear();
    await spellDb.meta.clear();

    await spellDb.spells.put({
      id: 'homebrew-zap',
      system: 'dnd5e',
      origin: 'homebrew',
      slug: 'custom-zap',
      name: 'Custom Zap',
      level: 1,
      school: '',
      castingTime: '1 action',
      range: '60 feet',
      components: 'V',
      duration: 'Instantaneous',
      classes: ['wizard'],
      desc: 'homebrew',
      source: 'Homebrew',
      createdAt: 1,
      updatedAt: 1,
    });

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === DND5EAPI_SPELLS_URL) {
        return jsonResponse({
          count: 1,
          results: [{ index: 'fireball', url: '/api/2014/spells/fireball' }],
        });
      }
      return jsonResponse(fireball);
    };

    const result = await syncDnd5eApiSpells(undefined, {
      fetchImpl,
      concurrency: 4,
    });
    expect(result.count).toBe(1);
    const stored = await spellDb.spells.get('dnd5e:wotc-srd:fireball');
    expect(stored?.origin).toBe('synced');
    const homebrew = await spellDb.spells.get('homebrew-zap');
    expect(homebrew?.name).toBe('Custom Zap');
  });
});
