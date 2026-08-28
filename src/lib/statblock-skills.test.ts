import { describe, expect, it } from 'vitest';
import {
  canonicalSkillName,
  skillCatalog,
  skillEntries,
  skillsFromRows,
} from './statblock-skills';

describe('statblock skills', () => {
  it('uses the catalog spelling for known skills', () => {
    expect(canonicalSkillName('stealth', 'dnd5e')).toBe('Stealth');
    expect(canonicalSkillName('animal handling', 'dnd5e')).toBe('Animal Handling');
    expect(canonicalSkillName('thievery', 'pf2e')).toBe('Thievery');
    expect(canonicalSkillName('Dragon Lore', 'pf2e')).toBe('Dragon Lore');
  });

  it('round-trips listed bonuses and drops blank names', () => {
    expect(skillCatalog('dnd5e')).toContain('Sleight of Hand');
    expect(skillCatalog('pf2e')).toContain('Occultism');
    const rows = skillEntries({ stealth: 7, Athletics: 4 }, 'pf2e');
    expect(rows).toEqual([
      { name: 'Athletics', bonus: 4 },
      { name: 'Stealth', bonus: 7 },
    ]);
    expect(skillsFromRows([...rows, { name: '  ', bonus: 3 }], 'pf2e')).toEqual({
      Athletics: 4,
      Stealth: 7,
    });
  });
});
