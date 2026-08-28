import { syncOpen5eBestiary, type SyncProgress } from '../../lib/bestiary';
import type { BestiarySource } from '../types';

export const dnd5eBestiary: BestiarySource = {
  id: 'open5e',
  label: 'Open5e (D&D 5e)',
  syncEnabled: true,
  async sync(onProgress) {
    await syncOpen5eBestiary((p: SyncProgress) => {
      onProgress?.(p.fetched, p.total);
    });
  },
};
