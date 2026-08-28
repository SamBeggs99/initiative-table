import { averageOf, rollExpression } from '../dice';
import { parseLegendaryCount, parseLimitedUses, parseSpellSlots } from '../parse';
import type { Combatant, HpRollMode, LimitedUse, StatBlock } from '../../types';
import { createCombatant } from '../../types';
import { newId } from '../uuid';

const SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function rollHp(block: StatBlock, mode: HpRollMode): number {
  if (mode === 'average' || !block.hitDice) return block.hpAvg;
  try {
    return Math.max(1, rollExpression(block.hitDice).total);
  } catch {
    return block.hpAvg;
  }
}

function hydrateLimitedUses(block: StatBlock): LimitedUse[] {
  const uses: LimitedUse[] = [];
  const seen = new Set<string>();
  const scan = (name: string, desc: string) => {
    const parsed = parseLimitedUses(`${name}. ${desc}`);
    if (!parsed) return;
    const key = parsed.name ?? name;
    if (seen.has(key)) return;
    seen.add(key);
    uses.push({
      name: key,
      max: parsed.max,
      used: 0,
      recharge: parsed.recharge,
    });
  };
  for (const t of [
    ...block.traits,
    ...block.actions,
    ...block.bonusActions,
    ...block.reactions,
  ]) {
    scan(t.name, t.desc);
  }
  return uses;
}

function hydrateLegendaryResistance(block: StatBlock): { max: number; used: number } {
  for (const t of block.traits) {
    const parsed = parseLimitedUses(`${t.name}. ${t.desc}`);
    if (parsed?.name === 'Legendary Resistance') {
      return { max: parsed.max, used: 0 };
    }
  }
  return { max: 0, used: 0 };
}

function hydrateLegendaryActions(block: StatBlock): { max: number; used: number } {
  if (!block.legendaryActions.length && !block.legendaryDesc) {
    return { max: 0, used: 0 };
  }
  const max = parseLegendaryCount(block.legendaryDesc ?? '');
  return { max, used: 0 };
}

function hydrateSpellSlots(block: StatBlock): Record<number, { max: number; used: number }> {
  const text = block.traits.map((t) => `${t.name}. ${t.desc}`).join('\n');
  return parseSpellSlots(text);
}

export interface AddCreaturesOptions {
  quantity: number; // 1–12
  hpMode: HpRollMode;
  nameOverride?: string;
  hpOverride?: number;
}

/** Build combatants from a stat block (embedded copy — frozen vs later sync). */
export function buildCombatantsFromStatBlock(
  block: StatBlock,
  opts: AddCreaturesOptions,
): Combatant[] {
  const quantity = Math.min(12, Math.max(1, Math.floor(opts.quantity)));
  const baseName = opts.nameOverride?.trim() || block.name;
  const groupKey = quantity > 1 ? newId() : undefined;
  const pf2ePerception = block.pf2e?.perception ?? null;

  const combatants: Combatant[] = [];
  for (let i = 0; i < quantity; i++) {
    const suffix = quantity > 1 ? ` ${SUFFIXES[i] ?? String(i + 1)}` : '';
    const hp =
      opts.hpOverride != null
        ? opts.hpOverride
        : rollHp(block, opts.hpMode);

    // Deep embed — fight is immune to mid-session sync
    const embedded: StatBlock = structuredClone(block);

    combatants.push(
      createCombatant({
        name: `${baseName}${suffix}`,
        kind: 'npc',
        groupKey,
        initiative: null,
        dex: block.abilities.dex,
        ac: block.ac,
        hp,
        maxHp: hp,
        tempHp: 0,
        perception: pf2ePerception ?? undefined,
        limitedUses: hydrateLimitedUses(block),
        legendaryActions: hydrateLegendaryActions(block),
        legendaryResistance: hydrateLegendaryResistance(block),
        spellSlots: hydrateSpellSlots(block),
        statBlock: embedded,
      }),
    );
  }
  return combatants;
}

/** Average HP helper exposed for UI preview. */
export function previewAverageHp(block: StatBlock): number {
  if (!block.hitDice) return block.hpAvg;
  try {
    return Math.floor(averageOf(block.hitDice));
  } catch {
    return block.hpAvg;
  }
}
