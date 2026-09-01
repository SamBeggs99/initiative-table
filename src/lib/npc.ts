import { fuzzyScore } from './palette/fuzzy';
import { open5eToStatBlock, type Open5eMonster } from './bestiary/normalize-open5e';
import { parseStatBlockText } from './statblock-import';
import type { NpcRecord, StatBlock } from '../types';

export function blankCharacterNpc(name = 'New NPC'): NpcRecord {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'character',
    tags: [],
    notes: '',
    writeBackHp: false,
  };
}

/**
 * Give a roleplay NPC a stat block so they can be run in a fight. Keeps the
 * record's own identity — name, portrait, notes, tags, relationships — and
 * hands back a statted copy. An NPC that already has stats is returned as-is.
 */
export function statNpc(npc: NpcRecord, block: StatBlock): NpcRecord {
  if (npc.kind === 'statted' && npc.statBlock) return npc;
  const name = npc.name.trim() || block.name;
  const max = block.hpAvg;
  return {
    ...npc,
    kind: 'statted',
    statBlock: {
      ...structuredClone(block),
      name,
      ...(npc.portraitDataUrl ? { portraitDataUrl: npc.portraitDataUrl } : {}),
    },
    persistentHp: { current: max, max },
    writeBackHp: true,
  };
}

export function npcFromStatBlock(
  block: StatBlock,
  opts?: { name?: string; writeBackHp?: boolean },
): NpcRecord {
  const name = opts?.name?.trim() || block.name;
  const max = block.hpAvg;
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'statted',
    statBlock: {
      ...structuredClone(block),
      // Keep as embedded homebrew-shaped copy for the NPC; don't mutate bestiary
      name,
    },
    persistentHp: { current: max, max },
    tags: [],
    notes: '',
    writeBackHp: opts?.writeBackHp ?? true,
    portraitDataUrl: block.portraitDataUrl,
  };
}

/** Search NPCs by name, faction, location, tags, notes, role, voice, wants, secret. */
export function searchNpcs(npcs: NpcRecord[], query: string): NpcRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...npcs].sort((a, b) => a.name.localeCompare(b.name));
  }
  const tokens = q.split(/\s+/).filter(Boolean);

  return npcs
    .map((npc) => {
      const hay = [
        npc.name,
        npc.role,
        npc.faction,
        npc.location,
        npc.voice,
        npc.wants,
        npc.secret,
        npc.notes,
        ...npc.tags,
        npc.statBlock?.type,
        npc.statBlock?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      let score = fuzzyScore(q, npc.name);
      for (const t of tokens) {
        if (npc.name.toLowerCase().includes(t)) score += 40;
        else if (npc.faction?.toLowerCase().includes(t)) score += 30;
        else if (npc.location?.toLowerCase().includes(t)) score += 30;
        else if (npc.tags.some((tag) => tag.toLowerCase().includes(t))) score += 25;
        else if (hay.includes(t)) score += 10;
        else {
          score = 0;
          break;
        }
      }
      return { npc, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.npc.name.localeCompare(b.npc.name))
    .map((r) => r.npc);
}

export function woundedLabel(npc: NpcRecord): string | null {
  if (!npc.persistentHp) return null;
  if (npc.persistentHp.current >= npc.persistentHp.max) return null;
  if (npc.persistentHp.current <= 0) {
    return npc.lastSeenSession != null
      ? `defeated, last seen session ${npc.lastSeenSession}`
      : 'defeated';
  }
  return npc.lastSeenSession != null
    ? `wounded, last seen session ${npc.lastSeenSession}`
    : 'wounded';
}

/** On combat end: write linked combatant HP back to roster NPCs with writeBackHp. */
export function applyNpcHpWriteBack(
  npcs: NpcRecord[],
  combatants: { sourceNpcId?: string; hp: number; maxHp: number }[],
  session: number,
): { npcs: NpcRecord[]; logs: string[] } {
  const updates = new Map<string, { hp: number; maxHp: number }>();
  for (const c of combatants) {
    if (!c.sourceNpcId) continue;
    updates.set(c.sourceNpcId, { hp: c.hp, maxHp: c.maxHp });
  }
  if (updates.size === 0) return { npcs, logs: [] };

  const logs: string[] = [];
  const next = npcs.map((npc) => {
    const u = updates.get(npc.id);
    if (!u || npc.writeBackHp === false) return npc;
    const max = npc.persistentHp?.max ?? u.maxHp;
    const current = Math.min(max, Math.max(0, u.hp));
    const note =
      current < max
        ? current <= 0
          ? `defeated, last seen session ${session}`
          : `wounded, last seen session ${session}`
        : null;
    logs.push(
      note
        ? `${npc.name} → ${note} (${current}/${max} HP)`
        : `${npc.name} HP written back ${current}/${max}`,
    );
    return {
      ...npc,
      persistentHp: { current, max },
      lastSeenSession: session,
      notes:
        note && !npc.notes.includes(note)
          ? [npc.notes, note].filter(Boolean).join('\n')
          : npc.notes,
    };
  });
  return { npcs: next, logs };
}

export type NpcImportResult =
  | { ok: true; npc: NpcRecord; warnings: string[] }
  | { ok: false; error: string };

/** Accept our NpcRecord / StatBlock export or Open5e-shaped JSON. */
export function importNpcJson(raw: string): NpcImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'JSON must be an object' };
  }

  const obj = data as Record<string, unknown>;
  const warnings: string[] = [];

  // Our NpcRecord shape
  if (obj.kind === 'statted' || obj.kind === 'character' || Array.isArray(obj.tags)) {
    const name = String(obj.name ?? 'Imported NPC');
    const kind = obj.kind === 'character' ? 'character' : 'statted';
    let statBlock: StatBlock | undefined;
    if (obj.statBlock && typeof obj.statBlock === 'object') {
      statBlock = obj.statBlock as StatBlock;
    } else if (kind === 'statted') {
      warnings.push('statted NPC missing statBlock');
    }
    const persistentHp =
      obj.persistentHp && typeof obj.persistentHp === 'object'
        ? (obj.persistentHp as { current: number; max: number })
        : statBlock
          ? { current: statBlock.hpAvg, max: statBlock.hpAvg }
          : undefined;

    return {
      ok: true,
      warnings,
      npc: {
        id: crypto.randomUUID(),
        name,
        kind,
        statBlock,
        persistentHp,
        role: typeof obj.role === 'string' ? obj.role : undefined,
        faction: typeof obj.faction === 'string' ? obj.faction : undefined,
        location: typeof obj.location === 'string' ? obj.location : undefined,
        voice: typeof obj.voice === 'string' ? obj.voice : undefined,
        wants: typeof obj.wants === 'string' ? obj.wants : undefined,
        secret: typeof obj.secret === 'string' ? obj.secret : undefined,
        tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
        notes: typeof obj.notes === 'string' ? obj.notes : '',
        writeBackHp: obj.writeBackHp !== false && kind === 'statted',
        portraitDataUrl:
          typeof obj.portraitDataUrl === 'string' ? obj.portraitDataUrl : undefined,
      },
    };
  }

  // Bare StatBlock (our export)
  if (typeof obj.name === 'string' && typeof obj.hpAvg === 'number' && obj.abilities) {
    const block = obj as unknown as StatBlock;
    return {
      ok: true,
      warnings: [],
      npc: npcFromStatBlock(block, { writeBackHp: true }),
    };
  }

  // Open5e-shaped
  if (typeof obj.name === 'string' && (obj.armor_class != null || obj.hit_points != null)) {
    const block = open5eToStatBlock(obj as unknown as Open5eMonster, 'bundled');
    block.id = crypto.randomUUID();
    block.origin = 'homebrew';
    return {
      ok: true,
      warnings: [],
      npc: npcFromStatBlock(block, { writeBackHp: true }),
    };
  }

  return {
    ok: false,
    error: 'Unrecognized JSON — expected NpcRecord, StatBlock, or Open5e monster',
  };
}

export function npcFromPaste(raw: string): {
  npc: NpcRecord;
  unparsed: string[];
  confidenceNotes: string[];
} {
  const parsed = parseStatBlockText(raw);
  const npc = npcFromStatBlock(parsed.statBlock, { writeBackHp: true });
  const confidenceNotes = Object.entries(parsed.confidence)
    .filter(([, v]) => v === 'low' || v === 'missing')
    .map(([k, v]) => `${k}: ${v}`);
  return { npc, unparsed: parsed.unparsed, confidenceNotes };
}
