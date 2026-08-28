import { getCreatureById } from './bestiary';
import {
  addCreatureEntry,
  blankEncounter,
} from './encounter-library';
import { blankPartyMember } from './party';
import type { PartyMember, SavedEncounter, System } from '../types';

/** Quick-add party row used by the first-campaign wizard. */
export interface WizardPartyDraft {
  name: string;
  playerName: string;
  class: string;
  level: number;
  ac: number;
  maxHp: number;
  dex: number;
}

/** Sensible starter party for a first 5e session — all L3 so a goblin pack reads. */
export const SAMPLE_PARTY_5E: WizardPartyDraft[] = [
  {
    name: 'Kaelen',
    playerName: 'You',
    class: 'Paladin',
    level: 3,
    ac: 18,
    maxHp: 28,
    dex: 10,
  },
  {
    name: 'Mirabel',
    playerName: 'Player 2',
    class: 'Wizard',
    level: 3,
    ac: 12,
    maxHp: 18,
    dex: 14,
  },
  {
    name: 'Thorn',
    playerName: 'Player 3',
    class: 'Druid',
    level: 3,
    ac: 14,
    maxHp: 24,
    dex: 12,
  },
  {
    name: 'Sable',
    playerName: 'Player 4',
    class: 'Rogue',
    level: 3,
    ac: 15,
    maxHp: 21,
    dex: 16,
  },
];

export const SAMPLE_PARTY_PF2E: WizardPartyDraft[] = [
  {
    name: 'Amiri',
    playerName: 'You',
    class: 'Barbarian',
    level: 1,
    ac: 18,
    maxHp: 21,
    dex: 14,
  },
  {
    name: 'Ezren',
    playerName: 'Player 2',
    class: 'Wizard',
    level: 1,
    ac: 15,
    maxHp: 14,
    dex: 12,
  },
  {
    name: 'Kyra',
    playerName: 'Player 3',
    class: 'Cleric',
    level: 1,
    ac: 16,
    maxHp: 16,
    dex: 10,
  },
  {
    name: 'Merisiel',
    playerName: 'Player 4',
    class: 'Rogue',
    level: 1,
    ac: 17,
    maxHp: 15,
    dex: 18,
  },
];

export function samplePartyForSystem(system: System): WizardPartyDraft[] {
  return system === 'pf2e' ? SAMPLE_PARTY_PF2E : SAMPLE_PARTY_5E;
}

export function emptyPartyDraft(): WizardPartyDraft {
  return {
    name: '',
    playerName: '',
    class: '',
    level: 1,
    ac: 14,
    maxHp: 20,
    dex: 12,
  };
}

export function draftToPartyMember(
  campaignId: string,
  system: System,
  draft: WizardPartyDraft,
): PartyMember {
  const base = blankPartyMember(campaignId, {
    name: draft.name.trim() || 'Adventurer',
    system,
  });
  return {
    ...base,
    playerName: draft.playerName.trim(),
    class: draft.class.trim(),
    level: Math.max(1, Math.min(20, Math.floor(draft.level) || 1)),
    ac: Math.max(1, Math.floor(draft.ac) || 10),
    maxHp: Math.max(1, Math.floor(draft.maxHp) || 10),
    currentHp: Math.max(1, Math.floor(draft.maxHp) || 10),
    dex: Math.max(1, Math.min(30, Math.floor(draft.dex) || 10)),
  };
}

export function isDraftComplete(draft: WizardPartyDraft): boolean {
  return draft.name.trim().length > 0 && draft.class.trim().length > 0;
}

/**
 * Seed a “Goblin ambush” pack from the bundled SRD. Returns null when the
 * bestiary has not been seeded yet (or for PF2e, which has no bundled catalog).
 */
export async function buildSampleEncounter(
  system: System,
  campaignName: string,
): Promise<SavedEncounter | null> {
  if (system !== 'dnd5e') return null;

  const goblin = await getCreatureById('dnd5e:wotc-srd:goblin');
  if (!goblin) return null;

  let enc = blankEncounter('dnd5e', 'Goblin ambush', [campaignName]);
  enc = addCreatureEntry(enc, { id: goblin.id, name: goblin.name }, 4);
  enc = {
    ...enc,
    notes: 'Sample pack from the first-campaign wizard — four goblins vs your party.',
  };
  return enc;
}
