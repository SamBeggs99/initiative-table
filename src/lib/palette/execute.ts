import {
  buildCombatantsFromStatBlock,
  getCreatureById,
  searchCreatures,
} from '../bestiary';
import type { PaletteIntent } from './parse';
import type { System } from '../../types';
import type { useStore } from '../../store';

type Store = ReturnType<typeof useStore.getState>;

export interface PaletteExecuteResult {
  ok: boolean;
  message: string;
  /** Ask UI to open a stat block preview */
  openStatBlock?: {
    source: 'npc' | 'combatant' | 'creature';
    id: string;
    name: string;
  };
  openSpell?: { id: string; name: string };
}

/**
 * Executes a parsed intent via existing store / bestiary APIs only.
 */
export async function executePaletteIntent(
  intent: PaletteIntent,
  store: Store,
): Promise<PaletteExecuteResult> {
  if (!intent.runnable) {
    return { ok: false, message: intent.preview };
  }

  const campaign = store.getActiveCampaign();
  const system: System = campaign?.system ?? 'dnd5e';

  switch (intent.type) {
    case 'next':
      store.nextTurn();
      return { ok: true, message: 'Next turn' };

    case 'back':
      store.prevTurn();
      return { ok: true, message: 'Previous turn' };

    case 'start':
      store.openInitiativePrompt();
      return { ok: true, message: 'Enter initiative to start combat' };

    case 'clear':
      store.clearEncounter();
      return { ok: true, message: 'Encounter cleared — party stays on the tracker' };

    case 'party-to-combat':
      store.addWholePartyToCombat();
      return { ok: true, message: 'Party synced to encounter' };

    case 'new-pc': {
      if (!campaign) {
        return { ok: false, message: 'No active campaign' };
      }
      const id = store.createBlankPartyMember(intent.name);
      return { ok: true, message: `Created party member (${id.slice(0, 8)}…)` };
    }

    case 'damage':
      store.applyDamage(intent.targetId, intent.amount);
      return { ok: true, message: intent.preview };

    case 'heal':
      store.applyHealing(intent.targetId, intent.amount);
      return { ok: true, message: intent.preview };

    case 'condition': {
      const combat = store.getActiveCombat();
      const endsOnRound =
        intent.rounds != null
          ? combat.round + intent.rounds
          : undefined;
      store.addCondition(intent.targetId, {
        name: intent.condition,
        endsOnRound,
      });
      return { ok: true, message: intent.preview };
    }

    case 'clock':
      store.addTracker({
        name: intent.name,
        kind: 'clock',
        value: 0,
        max: intent.segments,
        scope: 'encounter',
        autoTick: 'round-end',
      });
      return { ok: true, message: intent.preview };

    case 'add-creatures': {
      if (!campaign) {
        return { ok: false, message: 'No active campaign' };
      }
      const hits = await searchCreatures({
        system,
        campaignId: campaign.id,
        query: intent.query,
      });
      const top = hits[0]?.creature;
      if (!top) {
        return { ok: false, message: `No creature matching “${intent.query}”` };
      }
      const combatants = buildCombatantsFromStatBlock(top, {
        quantity: intent.quantity,
        hpMode: 'rolled',
      });
      for (const c of combatants) {
        store.addCombatant(c);
      }
      return {
        ok: true,
        message: `Added ${intent.quantity}× ${top.name}`,
      };
    }

    case 'open': {
      if (intent.source === 'creature') {
        const creature = await getCreatureById(intent.targetId);
        if (!creature) {
          return { ok: false, message: `Creature not found` };
        }
      }
      return {
        ok: true,
        message: intent.preview,
        openStatBlock: {
          source: intent.source,
          id: intent.targetId,
          name: intent.targetName,
        },
      };
    }

    case 'open-spell':
      return {
        ok: true,
        message: intent.preview,
        openSpell: { id: intent.spellId, name: intent.spellName },
      };

    default:
      return { ok: false, message: 'Unhandled intent' };
  }
}
