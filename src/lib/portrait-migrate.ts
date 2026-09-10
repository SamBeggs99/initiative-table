import { putPortrait } from './portrait-store';
import { bestiaryDb } from './bestiary/db';
import { useStore } from '../store';
import type { Campaign, NpcRecord, PartyMember, StatBlock } from '../types';

/**
 * One-time move of inline base64 portraits into the portrait store.
 *
 * Runs on every boot but does nothing once there is nothing left to move, so it
 * is safe to re-run — including after a cloud pull brings down an old blob from
 * a device that has not updated yet. Content addressing means re-importing the
 * same image is a no-op rather than a duplicate.
 */

function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg';
  if (!/;base64$/.test(header) && !header.includes(';base64')) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Move one record's data URL into the store, returning the patch to apply. */
async function migrateRef<T extends { portraitId?: string; portraitDataUrl?: string }>(
  record: T | undefined,
): Promise<{ portraitId?: string; portraitDataUrl: undefined } | null> {
  if (!record?.portraitDataUrl) return null;
  // Already has an id: the inline copy is redundant, just drop it.
  if (record.portraitId) return { portraitDataUrl: undefined };
  const blob = dataUrlToBlob(record.portraitDataUrl);
  if (!blob) return { portraitDataUrl: undefined };
  return { portraitId: await putPortrait(blob), portraitDataUrl: undefined };
}

async function migrateCampaign(campaign: Campaign): Promise<Campaign | null> {
  let changed = false;

  const party: PartyMember[] = [];
  for (const member of campaign.party) {
    const patch = await migrateRef(member);
    if (patch) {
      changed = true;
      party.push({ ...member, ...patch });
    } else {
      party.push(member);
    }
  }

  const npcs: NpcRecord[] = [];
  for (const npc of campaign.npcs) {
    const own = await migrateRef(npc);
    const block = await migrateRef(npc.statBlock);
    if (own || block) {
      changed = true;
      npcs.push({
        ...npc,
        ...(own ?? {}),
        ...(block && npc.statBlock
          ? { statBlock: { ...npc.statBlock, ...block } }
          : {}),
      });
    } else {
      npcs.push(npc);
    }
  }

  return changed ? { ...campaign, party, npcs } : null;
}

/**
 * Strip embedded portraits from the live tape. Combat rows resolve their
 * portrait from the sheet or the bestiary row, so a per-combatant copy was pure
 * duplication — eight goblins from one bestiary row meant eight copies of the
 * same image inside `combatByCampaign`, in localStorage.
 */
function stripCombatantPortraits(
  combatants: { statBlock?: StatBlock }[],
): { changed: boolean; next: typeof combatants } {
  let changed = false;
  const next = combatants.map((c) => {
    if (!c.statBlock?.portraitDataUrl) return c;
    changed = true;
    return { ...c, statBlock: { ...c.statBlock, portraitDataUrl: undefined } };
  });
  return { changed, next };
}

export async function migrateInlinePortraits(): Promise<number> {
  let moved = 0;
  const state = useStore.getState();

  // --- Campaign sheets ---
  const campaigns: Campaign[] = [];
  let campaignsChanged = false;
  for (const campaign of state.campaigns) {
    const next = await migrateCampaign(campaign);
    if (next) {
      campaignsChanged = true;
      moved += 1;
      campaigns.push(next);
    } else {
      campaigns.push(campaign);
    }
  }

  // --- Live tape ---
  const combatByCampaign = { ...state.combatByCampaign };
  let combatChanged = false;
  for (const [id, combat] of Object.entries(combatByCampaign)) {
    const { changed, next } = stripCombatantPortraits(combat.combatants);
    if (changed) {
      combatChanged = true;
      combatByCampaign[id] = {
        ...combat,
        combatants: next as typeof combat.combatants,
      };
    }
  }

  if (campaignsChanged || combatChanged) {
    useStore.setState({
      ...(campaignsChanged ? { campaigns } : {}),
      ...(combatChanged ? { combatByCampaign } : {}),
    });
  }

  // --- Bestiary rows (Dexie, so they were never a localStorage problem, but
  // they should reference the store like everything else) ---
  const withInline = await bestiaryDb.creatures
    .filter((c) => Boolean(c.portraitDataUrl))
    .toArray();
  for (const creature of withInline) {
    const patch = await migrateRef(creature);
    if (!patch) continue;
    await bestiaryDb.creatures.put({ ...creature, ...patch });
    moved += 1;
  }

  return moved;
}
