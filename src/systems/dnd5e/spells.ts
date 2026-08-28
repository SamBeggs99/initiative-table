import { syncDnd5eApiSpells } from '../../lib/spells';
import type { SpellSource } from '../types';

export const dnd5eSpells: SpellSource = {
  id: 'dnd5eapi-spells',
  label: 'D&D 5e SRD API spells (5e-bits)',
  syncEnabled: true,
  async sync(onProgress) {
    return syncDnd5eApiSpells((p) => {
      onProgress?.({
        fetched: p.fetched,
        total: p.total,
        message: p.message,
      });
    });
  },
};
