import type { System } from '../types';

/** 5e skills that appear with a plus on the monster sheet. */
export const SKILLS_5E = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
] as const;

/** PF2e trained skills. Perception lives on the PF2e block, not this list. */
export const SKILLS_PF2E = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Lore',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
] as const;

export function skillCatalog(system: System): readonly string[] {
  return system === 'pf2e' ? SKILLS_PF2E : SKILLS_5E;
}

/** Prefer the catalog spelling (Stealth, not stealth). Unknown names keep their trim. */
export function canonicalSkillName(name: string, system: System): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const catalog = skillCatalog(system);
  const found = catalog.find((s) => s.toLowerCase() === trimmed.toLowerCase());
  if (found) return found;
  return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function skillEntries(
  skills: Record<string, number>,
  system: System,
): { name: string; bonus: number }[] {
  return Object.entries(skills)
    .map(([name, bonus]) => ({
      name: canonicalSkillName(name, system),
      bonus: Number.isFinite(bonus) ? bonus : 0,
    }))
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function skillsFromRows(
  rows: { name: string; bonus: number }[],
  system: System,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const name = canonicalSkillName(row.name, system);
    if (!name) continue;
    out[name] = Math.trunc(row.bonus);
  }
  return out;
}
