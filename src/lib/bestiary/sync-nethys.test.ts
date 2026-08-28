import { describe, expect, it } from 'vitest';
import { bestiaryDb } from './db';
import nethysSnapshot from '../../data/nethys-monster-core.json' with { type: 'json' };
import { nethysToStatBlock, type NethysCreature } from './normalize-nethys';
import { fetchNethysCoreCreatures, syncNethysBestiary } from './sync-nethys';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const goblin: NethysCreature = {
  name: 'Goblin Warrior',
  level: -1,
  ac: 16,
  hp: 6,
  size: ['Small'],
  trait: ['Goblin', 'Humanoid'],
  dexterity: 3,
  perception: 2,
  fortitude_save: 5,
  reflex_save: 7,
  will_save: 3,
  speed: { land: 25 },
  markdown:
    '**Melee** <actions string="Single Action" /> dogslicer +7, **Damage** 1d6 slashing\n',
  primary_source: 'Monster Core',
};

const wolf: NethysCreature = {
  name: 'Wolf',
  level: 1,
  ac: 15,
  hp: 24,
  size: ['Medium'],
  trait: ['Animal'],
  markdown: '**Melee** <actions string="Single Action" /> jaws +9, **Damage** 1d8 piercing\n',
  primary_source: 'Monster Core',
};

describe('fetchNethysCoreCreatures', () => {
  it('pages with from/size and skips non-core hits', async () => {
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      const from = (bodies[bodies.length - 1] as { from?: number }).from ?? 0;
      if (from === 0) {
        return jsonResponse({
          hits: {
            total: { value: 2 },
            hits: [{ _id: 'creature-3024', _source: goblin }],
          },
        });
      }
      if (from === 1) {
        return jsonResponse({
          hits: {
            total: { value: 2 },
            hits: [
              {
                _id: 'creature-1',
                _source: { ...wolf, primary_source: 'Bestiary' },
              },
            ],
          },
        });
      }
      return jsonResponse({ hits: { total: { value: 2 }, hits: [] } });
    };

    const creatures = await fetchNethysCoreCreatures(undefined, {
      fetchImpl,
      pageSize: 1,
    });
    expect(creatures.map((c) => c.name)).toEqual(['Goblin Warrior']);
    expect(bodies).toHaveLength(3);
    expect((bodies[1] as { from?: number }).from).toBe(1);
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
      fetchNethysCoreCreatures(undefined, { fetchImpl }),
    ).rejects.toThrow(/Fielddata access on the _id field is disallowed/);
  });

  it('falls back to the bundled Monster Core snapshot when live Nethys is blocked', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    try {
      const creatures = await fetchNethysCoreCreatures();
      expect(creatures.length).toBeGreaterThan(700);
      expect(creatures.some((c) => c.slug === 'goblin-warrior')).toBe(true);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('syncNethysBestiary', () => {
  it('writes synced core creatures and leaves homebrew alone', async () => {
    await bestiaryDb.creatures.clear();
    await bestiaryDb.creaturesStaging.clear();
    await bestiaryDb.meta.clear();

    await bestiaryDb.creatures.put({
      id: 'homebrew-goblin',
      system: 'pf2e',
      origin: 'homebrew',
      slug: 'custom-goblin',
      name: 'Custom Goblin',
      size: 'Small',
      type: 'humanoid',
      alignment: '',
      ac: 16,
      hpAvg: 6,
      hitDice: '6',
      speed: { walk: 25 },
      abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 8, cha: 12 },
      saves: {},
      skills: {},
      senses: '',
      languages: '',
      cr: '-1',
      traits: [],
      actions: [],
      bonusActions: [],
      reactions: [],
      legendaryActions: [],
      source: 'Homebrew',
      createdAt: 1,
      updatedAt: 1,
    });

    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [{ _id: 'creature-3024', _source: goblin }],
        },
      });

    const result = await syncNethysBestiary(undefined, { fetchImpl, pageSize: 50 });
    expect(result.count).toBe(1);
    expect(nethysToStatBlock(goblin)?.id).toBe('pf2e:nethys:goblin-warrior');
    const stored = await bestiaryDb.creatures.get('pf2e:nethys:goblin-warrior');
    expect(stored?.origin).toBe('synced');
    const homebrew = await bestiaryDb.creatures.get('homebrew-goblin');
    expect(homebrew?.name).toBe('Custom Goblin');
  });
});

describe('nethys Monster Core snapshot', () => {
  it('includes remaster core creatures with PF2e fields', () => {
    const rows = nethysSnapshot as { slug?: string; name?: string; pf2e?: { level?: number } }[];
    expect(rows.length).toBeGreaterThan(700);
    const goblinRow = rows.find((c) => c.slug === 'goblin-warrior');
    expect(goblinRow?.name).toBe('Goblin Warrior');
    expect(goblinRow?.pf2e?.level).toBe(-1);
  });
});
