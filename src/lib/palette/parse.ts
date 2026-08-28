import { fuzzyPick, fuzzyScore } from './fuzzy';
import type { Combatant, NpcRecord, PartyMember, Tracker } from '../../types';

export interface PaletteNamed {
  id: string;
  name: string;
  kind: 'combatant' | 'party' | 'npc' | 'tracker' | 'creature' | 'command';
}

export interface PaletteContext {
  combatants: Combatant[];
  party: PartyMember[];
  npcs: NpcRecord[];
  trackers: Tracker[];
  /** Pre-fetched creature name hits from bestiary search (async filled by UI). */
  creatures: { id: string; name: string }[];
  /** Pre-fetched spell name hits (async filled by UI). */
  spells: { id: string; name: string }[];
}

export type PaletteIntent =
  | {
      type: 'add-creatures';
      query: string;
      quantity: number;
      preview: string;
      runnable: true;
    }
  | {
      type: 'damage';
      targetId: string;
      targetName: string;
      amount: number;
      preview: string;
      runnable: true;
    }
  | {
      type: 'heal';
      targetId: string;
      targetName: string;
      amount: number;
      preview: string;
      runnable: true;
    }
  | {
      type: 'open';
      targetId: string;
      targetName: string;
      source: 'npc' | 'combatant' | 'creature';
      preview: string;
      runnable: true;
    }
  | {
      type: 'open-spell';
      spellId: string;
      spellName: string;
      query: string;
      preview: string;
      runnable: boolean;
    }
  | {
      type: 'clock';
      name: string;
      segments: number;
      preview: string;
      runnable: true;
    }
  | { type: 'next'; preview: string; runnable: true }
  | { type: 'back'; preview: string; runnable: true }
  | { type: 'start'; preview: string; runnable: true }
  | { type: 'clear'; preview: string; runnable: true }
  | { type: 'party-to-combat'; preview: string; runnable: true }
  | { type: 'new-pc'; name?: string; preview: string; runnable: true }
  | {
      type: 'condition';
      targetId: string;
      targetName: string;
      condition: string;
      rounds?: number;
      preview: string;
      runnable: true;
    }
  | {
      type: 'ambiguous';
      preview: string;
      runnable: false;
      suggestions: string[];
    }
  | { type: 'empty'; preview: string; runnable: false }
  | { type: 'help'; preview: string; runnable: false }
  | { type: 'unknown'; preview: string; runnable: false; suggestions: string[] };

const COMMANDS = [
  { id: 'next', name: 'next', aliases: ['n'] },
  { id: 'back', name: 'back', aliases: ['prev', 'previous'] },
];

function resolveCombatant(
  query: string,
  ctx: PaletteContext,
): { id: string; name: string } | null {
  const hits = fuzzyPick(query, ctx.combatants, (c) => c.name, 5);
  if (hits[0] && hits[0].score >= 500) {
    // Prefer unique-ish top hit
    if (hits.length === 1 || hits[0].score > (hits[1]?.score ?? 0) + 50) {
      return { id: hits[0].item.id, name: hits[0].item.name };
    }
  }
  // Also match party names to combatants by shared name
  const partyHits = fuzzyPick(query, ctx.party, (p) => p.name, 3);
  if (partyHits[0]) {
    const inCombat = ctx.combatants.find(
      (c) =>
        c.sourcePartyMemberId === partyHits[0]!.item.id ||
        c.name.toLowerCase() === partyHits[0]!.item.name.toLowerCase() ||
        c.sourceNpcId === partyHits[0]!.item.id,
    );
    if (inCombat) return { id: inCombat.id, name: inCombat.name };
  }
  if (hits[0] && hits[0].score > 0) {
    return { id: hits[0].item.id, name: hits[0].item.name };
  }
  return null;
}

function titleCaseCondition(raw: string): string {
  return raw
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Pure parser: turns palette text into an intent. Does not touch the store.
 * Creature resolution for add/open may be refined by async creature hits in ctx.
 */
export function parsePaletteInput(raw: string, ctx: PaletteContext): PaletteIntent {
  const input = raw.trim().replace(/\s+/g, ' ');
  if (!input) {
    return {
      type: 'empty',
      preview: 'HP field and commands — leave blank or type help',
      runnable: false,
    };
  }

  if (/^(help|\?|hp|legend)$/i.test(input)) {
    return {
      type: 'help',
      preview: 'Combat HP field and palette commands',
      runnable: false,
    };
  }

  const lower = input.toLowerCase();

  // next / back / start / party
  if (/^(next|n)$/i.test(input)) {
    return { type: 'next', preview: 'Advance to next turn', runnable: true };
  }
  if (/^(back|prev|previous)$/i.test(input)) {
    return { type: 'back', preview: 'Go back one turn', runnable: true };
  }
  if (/^(start|start combat|begin)$/i.test(input)) {
    return {
      type: 'start',
      preview: 'Start combat — enter initiative for everyone',
      runnable: true,
    };
  }
  if (/^(clear|clear encounter|reset encounter)$/i.test(input)) {
    return {
      type: 'clear',
      preview: 'Remove enemies and loot — party stays on the tracker',
      runnable: true,
    };
  }
  if (/^(party(?:\s+to\s+combat)?|add party)$/i.test(input)) {
    return {
      type: 'party-to-combat',
      preview: 'Add missing party members to the encounter',
      runnable: true,
    };
  }
  {
    const m = input.match(/^new\s+pc(?:\s+(.+))?$/i);
    if (m) {
      const name = m[1]?.trim();
      return {
        type: 'new-pc',
        name,
        preview: name
          ? `Create player character “${name}”`
          : 'Create a blank player character',
        runnable: true,
      };
    }
  }

  // dmg <target> <n>
  {
    const m = input.match(/^(?:dmg|damage)\s+(.+?)\s+(\d+)\s*$/i);
    if (m) {
      const target = resolveCombatant(m[1]!, ctx);
      if (!target) {
        return {
          type: 'unknown',
          preview: `No combatant matching “${m[1]}”`,
          runnable: false,
          suggestions: fuzzyPick(m[1]!, ctx.combatants, (c) => c.name, 5).map(
            (h) => h.name,
          ),
        };
      }
      return {
        type: 'damage',
        targetId: target.id,
        targetName: target.name,
        amount: Number(m[2]),
        preview: `Deal ${m[2]} damage to ${target.name}`,
        runnable: true,
      };
    }
  }

  // heal <target> <n>
  {
    const m = input.match(/^heal\s+(.+?)\s+(\d+)\s*$/i);
    if (m) {
      const target = resolveCombatant(m[1]!, ctx);
      if (!target) {
        return {
          type: 'unknown',
          preview: `No combatant matching “${m[1]}”`,
          runnable: false,
          suggestions: fuzzyPick(m[1]!, ctx.combatants, (c) => c.name, 5).map(
            (h) => h.name,
          ),
        };
      }
      return {
        type: 'heal',
        targetId: target.id,
        targetName: target.name,
        amount: Number(m[2]),
        preview: `Heal ${target.name} for ${m[2]}`,
        runnable: true,
      };
    }
  }

  // cond <target> <condition> [rounds]
  {
    const m = input.match(/^cond(?:ition)?\s+(\S+)\s+(\S+)(?:\s+(\d+))?\s*$/i);
    if (m) {
      const target = resolveCombatant(m[1]!, ctx);
      if (!target) {
        return {
          type: 'unknown',
          preview: `No combatant matching “${m[1]}”`,
          runnable: false,
          suggestions: fuzzyPick(m[1]!, ctx.combatants, (c) => c.name, 5).map(
            (h) => h.name,
          ),
        };
      }
      const condition = titleCaseCondition(m[2]!);
      const rounds = m[3] ? Number(m[3]) : undefined;
      return {
        type: 'condition',
        targetId: target.id,
        targetName: target.name,
        condition,
        rounds,
        preview: rounds
          ? `Apply ${condition} to ${target.name} for ${rounds} rounds`
          : `Apply ${condition} to ${target.name}`,
        runnable: true,
      };
    }
  }

  // spell <name>
  {
    const m = input.match(/^spell(?:s)?\s+(.+)$/i);
    if (m) {
      const query = m[1]!.trim();
      const hit = ctx.spells[0];
      return {
        type: 'open-spell',
        spellId: hit?.id ?? '',
        spellName: hit?.name ?? query,
        query,
        preview: hit
          ? `Open spell “${hit.name}”`
          : `Search spell “${query}”`,
        runnable: Boolean(hit),
      };
    }
  }

  // clock <name> <segments>
  {
    const m = input.match(/^clock\s+(.+?)\s+(\d+)\s*$/i);
    if (m) {
      const segments = Number(m[2]);
      const name = m[1]!.trim();
      return {
        type: 'clock',
        name,
        segments,
        preview: `Create encounter clock “${name}” with ${segments} segments`,
        runnable: true,
      };
    }
  }

  // "<n> <creature>" add quantity
  {
    const m = input.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const quantity = Math.min(12, Math.max(1, Number(m[1])));
      const query = m[2]!.trim();
      const creatureHint = ctx.creatures[0]?.name;
      return {
        type: 'add-creatures',
        query,
        quantity,
        preview: creatureHint
          ? `Add ${quantity}× ${creatureHint} (rolled HP)`
          : `Add ${quantity}× “${query}” from bestiary (rolled HP)`,
        runnable: true,
      };
    }
  }

  // Bare name — open NPC / combatant / creature
  {
    const npcHits = fuzzyPick(input, ctx.npcs, (n) => n.name, 5);
    const combHits = fuzzyPick(
      input,
      ctx.combatants.filter((c) => c.statBlock),
      (c) => c.name,
      5,
    );
    const creatureHits = fuzzyPick(input, ctx.creatures, (c) => c.name, 5);

    const candidates: {
      score: number;
      intent: Extract<PaletteIntent, { type: 'open' }>;
    }[] = [];

    if (npcHits[0]) {
      candidates.push({
        score: npcHits[0].score + 20, // prefer NPCs for bare name
        intent: {
          type: 'open',
          targetId: npcHits[0].item.id,
          targetName: npcHits[0].item.name,
          source: 'npc',
          preview: `Open NPC “${npcHits[0].item.name}”`,
          runnable: true,
        },
      });
    }
    if (combHits[0]) {
      candidates.push({
        score: combHits[0].score,
        intent: {
          type: 'open',
          targetId: combHits[0].item.id,
          targetName: combHits[0].item.name,
          source: 'combatant',
          preview: `Open stat block for ${combHits[0].item.name}`,
          runnable: true,
        },
      });
    }
    if (creatureHits[0]) {
      candidates.push({
        score: creatureHits[0].score - 10,
        intent: {
          type: 'open',
          targetId: creatureHits[0].item.id,
          targetName: creatureHits[0].item.name,
          source: 'creature',
          preview: `Open bestiary entry “${creatureHits[0].item.name}”`,
          runnable: true,
        },
      });
    }

    // Also treat as add-one if it looks like a creature query and no strong open hit
    if (candidates.length === 0 && input.length >= 2) {
      return {
        type: 'add-creatures',
        query: input,
        quantity: 1,
        preview: ctx.creatures[0]
          ? `Add 1× ${ctx.creatures[0].name}`
          : `Add 1× “${input}” from bestiary`,
        runnable: true,
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0] && candidates[0].score > 0) {
      const top = candidates[0];
      const second = candidates[1];
      if (second && second.score > top.score - 30 && second.intent.targetName !== top.intent.targetName) {
        return {
          type: 'ambiguous',
          preview: `Did you mean “${top.intent.targetName}” or “${second.intent.targetName}”?`,
          runnable: false,
          suggestions: candidates.slice(0, 5).map((c) => c.intent.preview),
        };
      }
      // If bare name strongly matches a creature and weak open, prefer add for monster names
      if (
        top.intent.source === 'creature' &&
        !npcHits[0] &&
        fuzzyScore(lower, top.intent.targetName.toLowerCase()) >= 500
      ) {
        // Still allow open — but examples say "adult red dragon" adds one.
        // Bare creature name without NPC → add one.
        return {
          type: 'add-creatures',
          query: input,
          quantity: 1,
          preview: `Add 1× ${top.intent.targetName}`,
          runnable: true,
        };
      }
      return top.intent;
    }
  }

  // Fuzzy command suggestions
  const cmdHits = fuzzyPick(
    input,
    COMMANDS,
    (c) => c.name,
    3,
  );

  return {
    type: 'unknown',
    preview: `Don’t understand “${input}”`,
    runnable: false,
    suggestions: [
      ...cmdHits.map((h) => h.name),
      '4 goblins',
      'dmg kael 14',
      'heal grix 8',
      'clock ritual 6',
      'cond kael frightened 3',
    ].slice(0, 6),
  };
}
