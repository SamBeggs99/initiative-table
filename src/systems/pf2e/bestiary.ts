import { syncNethysBestiary } from '../../lib/bestiary/sync-nethys';
import type { BestiarySource } from '../types';

export const pf2eBestiary: BestiarySource = {
  id: 'nethys-monster-core',
  label: 'Archives of Nethys (Monster Core)',
  syncEnabled: true,
  async sync(onProgress) {
    return syncNethysBestiary((p) => {
      onProgress?.({
        fetched: p.fetched,
        total: p.total,
        message: p.message,
      });
    });
  },
};
