import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/cloud/client';
import { isCloudConfigured } from '../lib/cloud/env';
import { CloudAuthContext } from '../lib/cloud/auth-context';
import { withTimeout } from '../lib/cloud/timeout';
import { flushCloudNow, stopCloudSync } from '../lib/cloud/sync';
import { clearDeviceData } from '../store';

export function CloudAuthProvider({ children }: { children: ReactNode }) {
  const configured = isCloudConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [authReachable, setAuthReachable] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const client = getSupabase();
    if (!client) {
      setReady(true);
      return;
    }
    let cancelled = false;
    /*
     * Bounded and caught. `getSession` normally resolves from local storage,
     * but an expired token makes it attempt a refresh — and with no network
     * that used to leave `ready` false forever, parking the DM on "Signing
     * in…" with their local campaign behind a spinner. Now the app always gets
     * past the gate, and `authReachable` records why.
     */
    void withTimeout(client.auth.getSession(), 'auth session', 8000)
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setAuthReachable(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(
          'Session read failed; auth server unreachable',
          err instanceof Error ? err.message : err,
        );
        setAuthReachable(false);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // An auth event means we reached the server.
      setAuthReachable(true);
      // A real session supersedes local-only mode.
      if (next) setLocalOnly(false);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const continueOffline = useCallback(() => setLocalOnly(true), []);

  /*
   * Order matters. Campaigns belong to the account, and signing in anywhere
   * restores them, so a signed-out device should not keep an unreachable copy
   * on disk. But clearing before the last push would destroy work that never
   * left the device — flush first, and only clear if it landed.
   */
  const signOut = useCallback(async () => {
    const client = getSupabase();
    let pushed = true;
    try {
      await flushCloudNow({ awaitCompletion: true });
    } catch (err) {
      pushed = false;
      console.warn(
        'Final push before sign-out failed',
        err instanceof Error ? err.message : err,
      );
    }
    stopCloudSync();
    try {
      await client?.auth.signOut();
    } catch (err) {
      console.warn(
        'Sign-out request failed; clearing this device anyway',
        err instanceof Error ? err.message : err,
      );
    }
    setLocalOnly(false);
    setSession(null);
    // Keep the local copy when the final push did not land — losing a session
    // to a sign-out is exactly the failure this app is not allowed to have.
    if (pushed) await clearDeviceData();
  }, []);

  const value = useMemo(
    () => ({
      configured,
      ready,
      session,
      email: session?.user.email ?? null,
      authReachable,
      localOnly,
      continueOffline,
      signOut,
    }),
    [
      configured,
      ready,
      session,
      authReachable,
      localOnly,
      continueOffline,
      signOut,
    ],
  );

  return (
    <CloudAuthContext.Provider value={value}>{children}</CloudAuthContext.Provider>
  );
}
