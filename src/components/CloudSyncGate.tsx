import { useEffect, useState, type ReactNode } from 'react';
import { useCloudAuth } from '../lib/cloud/auth-context';
import { BootScreen } from './LoginScreen';
import { ToastHost } from './ToastHost';
import { startCloudSync, stopCloudSync } from '../lib/cloud/sync';
import { useStore } from '../store';

export function CloudSyncGate({ children }: { children: ReactNode }) {
  const { configured, session } = useCloudAuth();
  const userId = session?.user.id;
  const [ready, setReady] = useState(!configured || !userId);
  const pushToast = useStore((s) => s.pushToast);

  useEffect(() => {
    if (!configured || !userId) {
      stopCloudSync();
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void (async () => {
      const result = await startCloudSync();
      if (cancelled) return;
      if (result === 'uploaded' && useStore.getState().campaigns.length > 0) {
        pushToast('Saved this device’s campaigns to your account');
      } else if (result === 'hydrated') {
        pushToast('Loaded your campaigns from the cloud');
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      stopCloudSync();
    };
  }, [configured, userId, pushToast]);

  if (!ready) {
    return (
      <>
        <BootScreen message="Loading your table…" />
        <ToastHost />
      </>
    );
  }
  return children;
}
