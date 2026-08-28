import type { Campaign, CombatState, SavedEncounter } from '../types';

export const CAMPAIGN_EXPORT_VERSION = 1;

export interface CampaignExportPayload {
  version: number;
  exportedAt: number;
  campaign: Campaign;
  combat?: CombatState;
  /** Optional: encounter ids from the global library tagged for this campaign. */
  linkedEncounterIds?: string[];
}

export type CampaignImportResult =
  | { ok: true; payload: CampaignExportPayload }
  | { ok: false; error: string };

export function exportCampaignPayload(
  campaign: Campaign,
  combat?: CombatState,
  linkedEncounterIds?: string[],
): CampaignExportPayload {
  return {
    version: CAMPAIGN_EXPORT_VERSION,
    exportedAt: Date.now(),
    campaign: structuredClone(campaign),
    combat: combat ? structuredClone(combat) : undefined,
    linkedEncounterIds,
  };
}

export function parseCampaignImport(raw: string): CampaignImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Expected an object' };
  }
  const obj = data as Record<string, unknown>;
  const campaign = obj.campaign;
  if (!campaign || typeof campaign !== 'object') {
    // Allow bare Campaign
    if (typeof obj.id === 'string' && typeof obj.name === 'string' && Array.isArray(obj.party)) {
      const bare = campaignAsImport(obj as unknown as Campaign);
      return {
        ok: true,
        payload: {
          version: CAMPAIGN_EXPORT_VERSION,
          exportedAt: Date.now(),
          campaign: bare.campaign,
        },
      };
    }
    return { ok: false, error: 'Missing campaign object' };
  }
  const imported = campaignAsImport(
    campaign as Campaign,
    obj.combat as CombatState | undefined,
  );
  return {
    ok: true,
    payload: {
      version: typeof obj.version === 'number' ? obj.version : CAMPAIGN_EXPORT_VERSION,
      exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
      campaign: imported.campaign,
      combat: imported.combat,
      linkedEncounterIds: Array.isArray(obj.linkedEncounterIds)
        ? obj.linkedEncounterIds.map(String)
        : undefined,
    },
  };
}

/**
 * Re-key an imported campaign so it cannot collide with existing records.
 * Combatants and NPC relationships travel through the same old→new maps —
 * without that, an export taken mid-fight loses HP write-back and end-of-combat
 * roster sync, because every source id points at a character that no longer exists.
 */
function campaignAsImport(
  c: Campaign,
  combat?: CombatState,
): { campaign: Campaign; combat: CombatState | undefined } {
  const campaignId = crypto.randomUUID();
  const partyIds = new Map<string, string>();
  const npcIds = new Map<string, string>();

  const party = (c.party ?? []).map((p) => {
    const id = crypto.randomUUID();
    partyIds.set(p.id, id);
    return { ...p, id, campaignId };
  });

  const npcs = (c.npcs ?? []).map((n) => {
    const id = crypto.randomUUID();
    npcIds.set(n.id, id);
    return {
      ...n,
      id,
      relationships: n.relationships
        ?.map((r) => {
          const partyMemberId = partyIds.get(r.partyMemberId);
          // Drop links that didn't survive re-keying — stale UUIDs look like
          // real party members and poison the NPC detail pane.
          return partyMemberId ? { ...r, partyMemberId } : null;
        })
        .filter((r): r is { partyMemberId: string; note: string } => r != null),
    };
  });

  return {
    campaign: {
      ...c,
      id: campaignId,
      lastOpened: Date.now(),
      sessionNotes: Array.isArray(c.sessionNotes)
        ? c.sessionNotes.map((n) => ({
            ...n,
            id: crypto.randomUUID(),
          }))
        : [],
      party,
      npcs,
      trackers: (c.trackers ?? []).map((t) => ({ ...t, id: crypto.randomUUID() })),
    },
    combat: combat
      ? {
          ...combat,
          loot: Array.isArray(combat.loot) ? combat.loot : [],
          combatants: (combat.combatants ?? []).map((cb) => ({
            ...cb,
            // An unresolvable link is dropped rather than kept — a dangling id
            // would write HP back onto whoever later takes that uuid.
            sourcePartyMemberId: cb.sourcePartyMemberId
              ? partyIds.get(cb.sourcePartyMemberId)
              : undefined,
            sourceNpcId: cb.sourceNpcId ? npcIds.get(cb.sourceNpcId) : undefined,
          })),
        }
      : undefined,
  };
}

export function serializeEncountersExport(encounters: SavedEncounter[]): string {
  return JSON.stringify(
    { version: CAMPAIGN_EXPORT_VERSION, exportedAt: Date.now(), encounters },
    null,
    2,
  );
}
