import { syncNethysSpells } from '../../lib/spells/sync-nethys';
import type { SpellSource } from '../types';

export const pf2eSpells: SpellSource = {
  id: 'nethys-core-spells',
  label: 'Archives of Nethys (Player Core)',
  syncEnabled: true,
  async sync(onProgress) {
    return syncNethysSpells((p) => {
      onProgress?.({
        fetched: p.fetched,
        total: p.total,
        message: p.message,
      });
    });
  },
};
