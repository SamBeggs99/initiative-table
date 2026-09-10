import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface CloudAuthValue {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  /**
   * False when the session read failed or timed out — i.e. the auth server is
   * unreachable, as opposed to answering that nobody is signed in.
   *
   * The distinction is the whole point: `session === null` used to mean both
   * "offline" and "signed out", so an offline DM was shown a login form they
   * could not complete, with their local campaign on the far side of it.
   */
  authReachable: boolean;
  /**
   * The DM chose to work on this device without a cloud session. Session-scoped
   * on purpose — never persisted, so it cannot become a way to permanently
   * bypass sign-in.
   */
  localOnly: boolean;
  /** Enter local-only mode. Only offered when auth is unreachable. */
  continueOffline: () => void;
  /**
   * Sign out, flushing any unpushed work to the cloud first and then clearing
   * this device. Campaigns live in the account, so a signed-out device holding
   * an unreachable copy is worse than a clean one.
   */
  signOut: () => Promise<void>;
}

export const CloudAuthContext = createContext<CloudAuthValue>({
  configured: false,
  ready: true,
  session: null,
  email: null,
  authReachable: true,
  localOnly: false,
  continueOffline: () => {},
  signOut: async () => {},
});

export function useCloudAuth(): CloudAuthValue {
  return useContext(CloudAuthContext);
}
