import { formatModifier } from './statblock-derived';
import { abilityModFromCombatant, combatantRole } from './combat';
import type { Combatant } from '../types';
import type { SystemAdapter } from '../systems/types';

export interface InitiativePromptRow {
  /** Form field id: one combatant per row. */
  key: string;
  label: string;
  combatantIds: string[];
  /** Prefill: PF2e perception or lair 20. Null = DM must enter/roll. */
  suggested: number | null;
  hint: string;
  representative: Combatant;
}

function perceptionOf(c: Combatant): number | null {
  if (c.perception != null) return c.perception;
  if (c.statBlock?.pf2e?.perception != null) return c.statBlock.pf2e.perception;
  return null;
}

/** Strip A–Z / numeric suffixes from pack names (`Goblin A` → `Goblin`). */
export function stripPackSuffix(name: string): string {
  return name.replace(/ ([A-Z]|[1-9]\d*)$/, '');
}

function suggestedFor(c: Combatant, rolled: boolean): number | null {
  // Do not reuse leftover scores from adding creatures — initiative is
  // collected at Start combat, one value per combatant.
  if (c.kind === 'lair') return 20;
  if (!rolled) {
    const p = perceptionOf(c);
    if (p != null) return p;
  }
  return null;
}

function hintFor(c: Combatant, rolled: boolean): string {
  if (c.kind === 'lair') return 'usually 20';
  if (!rolled) {
    const p = perceptionOf(c);
    return p != null ? `Perception ${formatModifier(p)}` : 'Perception';
  }
  return `d20${formatModifier(abilityModFromCombatant(c, 'dex'))}`;
}

/**
 * One field per combatant. Packs (shared `groupKey`) still roll separately —
 * every player and enemy needs their own initiative.
 */
export function buildInitiativePromptRows(
  combatants: Combatant[],
  opts: { rolled: boolean },
): InitiativePromptRow[] {
  return combatants.map((c) => ({
    key: c.id,
    label: c.name,
    combatantIds: [c.id],
    suggested: suggestedFor(c, opts.rolled),
    hint: hintFor(c, opts.rolled),
    representative: c,
  }));
}

export function seedInitiativeValues(
  rows: InitiativePromptRow[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of rows) {
    values[row.key] = row.suggested == null ? '' : String(row.suggested);
  }
  return values;
}

/** Map row field values onto every combatant id. Null if any row is not a number. */
export function expandInitiativeValues(
  rows: InitiativePromptRow[],
  values: Record<string, string>,
): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const raw = String(values[row.key] ?? '').trim();
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    for (const id of row.combatantIds) out[id] = n;
  }
  return out;
}

export function applyInitiativeMap(
  combatants: Combatant[],
  map: Record<string, number>,
): Combatant[] {
  return combatants.map((c) =>
    Object.prototype.hasOwnProperty.call(map, c.id)
      ? { ...c, initiative: map[c.id]! }
      : c,
  );
}

export function rollInitiativeFor(
  c: Combatant,
  adapter: Pick<SystemAdapter, 'initiative' | 'initiativeIsRolled'>,
): number {
  if (c.kind === 'lair') return 20;
  return adapter.initiative(c);
}

export function rowRoleLabel(row: InitiativePromptRow): string {
  const role = combatantRole(row.representative);
  if (role === 'pc') return 'PC';
  if (role === 'lair') return 'Lair';
  if (role === 'npc') return 'NPC';
  return 'Creature';
}
