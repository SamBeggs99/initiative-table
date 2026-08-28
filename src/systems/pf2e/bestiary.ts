import type { BestiarySource } from '../types';

/**
 * PF2e has no CORS-friendly open endpoint wired in v1.
 * Manual entry + paste-parser only; AoN / Pathfinder 2e API can drop in later.
 */
export const pf2eBestiary: BestiarySource = {
  id: 'manual-pf2e',
  label: 'PF2e (manual / paste)',
  syncEnabled: false,
  syncDisabledReason:
    'No CORS-friendly open PF2e bestiary endpoint is wired yet. Use homebrew entry or paste import. An Archives of Nethys adapter can plug into this interface later.',
  async sync() {
    throw new Error(
      'PF2e bestiary sync is not available. Use manual entry or paste import.',
    );
  },
};
