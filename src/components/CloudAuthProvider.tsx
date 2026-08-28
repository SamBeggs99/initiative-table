import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/cloud/client';
import { isCloudConfigured } from '../lib/cloud/env';
import { CloudAuthContext } from '../lib/cloud/auth-context';

export function CloudAuthProvider({ children }: { children: ReactNode }) {
  const configured = isCloudConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) return;
    const client = getSupabase();
    if (!client) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const value = useMemo(
    () => ({
      configured,
      ready,
      session,
      email: session?.user.email ?? null,
      signOut: async () => {
        await getSupabase()?.auth.signOut();
      },
    }),
    [configured, ready, session],
  );

  return (
    <CloudAuthContext.Provider value={value}>{children}</CloudAuthContext.Provider>
  );
}
