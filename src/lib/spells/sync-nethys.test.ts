import { describe, expect, it } from 'vitest';
import { spellDb } from './db';
import { nethysToSpell, type NethysSpell } from './normalize-nethys';
import { fetchNethysCoreSpells, syncNethysSpells } from './sync-nethys';
import nethysSnapshot from '../../data/nethys-player-core-spells.json' with { type: 'json' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fireball: NethysSpell = {
  name: 'Fireball',
  level: 3,
  actions: 'Two Actions',
  tradition: ['Arcane'],
  trait: ['Fire'],
  range_raw: '500 feet',
  markdown: 'header\n---\nA roaring blast of fire.\n',
  primary_source: 'Player Core',
};

const heal: NethysSpell = {
  name: 'Heal',
  level: 1,
  actions: 'One Action',
  tradition: ['Divine'],
  trait: ['Healing', 'Vitality'],
  range_raw: 'touch',
  markdown: 'header\n---\nYou restore Hit Points.\n',
  primary_source: 'Player Core',
};

describe('fetchNethysCoreSpells', () => {
  it('pages with from/size and skips non-core hits', async () => {
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      const from = (bodies[bodies.length - 1] as { from?: number }).from ?? 0;
      if (from === 0) {
        return jsonResponse({
          hits: {
            total: { value: 2 },
            hits: [{ _id: 'spell-1530', _source: fireball }],
          },
        });
      }
      if (from === 1) {
        return jsonResponse({
          hits: {
            total: { value: 2 },
            hits: [
              {
                _id: 'spell-1',
                _source: {
                  ...heal,
                  primary_source: 'Secrets of Magic',
                },
              },
            ],
          },
        });
      }
      return jsonResponse({ hits: { total: { value: 2 }, hits: [] } });
    };

    const spells = await fetchNethysCoreSpells(undefined, {
      fetchImpl,
      pageSize: 1,
    });
    expect(spells.map((s) => s.name)).toEqual(['Fireball']);
    expect(bodies).toHaveLength(3);
    expect((bodies[1] as { from?: number }).from).toBe(1);
    expect(
      (bodies[0] as { sort?: unknown }).sort,
    ).toBeUndefined();
  });

  it('surfaces Elasticsearch error text on 400', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            root_cause: [
              {
                type: 'illegal_argument_exception',
                reason: 'Fielddata access on the _id field is disallowed',
              },
            ],
          },
        }),
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(
      fetchNethysCoreSpells(undefined, { fetchImpl }),
    ).rejects.toThrow(/Fielddata access on the _id field is disallowed/);
  });
});

describe('nethys Player Core snapshot', () => {
  it('maps the bundled snapshot to spells', () => {
    const mapped = (nethysSnapshot as NethysSpell[])
      .map((row) => nethysToSpell(row, 'synced'))
      .filter((s): s is NonNullable<typeof s> => s != null);
    expect(mapped.length).toBeGreaterThan(400);
    expect(mapped.some((s) => /fireball/i.test(s.name) || s.slug === 'fireball')).toBe(
      true,
    );
  });
});

describe('syncNethysSpells', () => {
  it('writes synced core spells and leaves homebrew alone', async () => {
    await spellDb.spells.clear();
    await spellDb.spellsStaging.clear();
    await spellDb.meta.clear();

    await spellDb.spells.put({
      id: 'homebrew-heal',
      system: 'pf2e',
      origin: 'homebrew',
      slug: 'custom-heal',
      name: 'Custom Heal',
      level: 1,
      school: '',
      castingTime: '2 actions',
      range: '30 feet',
      components: '',
      duration: 'Instantaneous',
      classes: ['divine'],
      desc: 'homebrew',
      source: 'Homebrew',
      createdAt: 1,
      updatedAt: 1,
    });

    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [{ _id: 'spell-1530', _source: fireball }],
        },
      });

    const result = await syncNethysSpells(undefined, { fetchImpl, pageSize: 50 });
    expect(result.count).toBe(1);
    expect(nethysToSpell(fireball)?.id).toBe('pf2e:nethys:fireball');
    const stored = await spellDb.spells.get('pf2e:nethys:fireball');
    expect(stored?.origin).toBe('synced');
    const homebrew = await spellDb.spells.get('homebrew-heal');
    expect(homebrew?.name).toBe('Custom Heal');
  });
});
