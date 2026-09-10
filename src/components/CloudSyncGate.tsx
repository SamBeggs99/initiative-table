import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useCloudAuth } from '../lib/cloud/auth-context';
import { BootScreen } from './LoginScreen';
import { ToastHost } from './ToastHost';
import { CloudConflictDialog } from './CloudConflictDialog';
import {
  startCloudSync,
  stopCloudSync,
  type CloudConflict,
} from '../lib/cloud/sync';
import { useStore } from '../store';
import { migrateInlinePortraits } from '../lib/portrait-migrate';

export function CloudSyncGate({ children }: { children: ReactNode }) {
  const { configured, session } = useCloudAuth();
  const userId = session?.user.id;
  const [ready, setReady] = useState(!configured || !userId);
  const [conflict, setConflict] = useState<CloudConflict | null>(null);

  useEffect(() => {
    if (!configured || !userId) {
      stopCloudSync();
      setConflict(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    setConflict(null);
    void (async () => {
      try {
        const result = await startCloudSync();
        if (cancelled) return;
        const pushToast = useStore.getState().pushToast;
        if (result.kind === 'conflict') {
          setConflict(result.conflict);
        } else if (
          result.kind === 'uploaded' &&
          useStore.getState().campaigns.length > 0
        ) {
          pushToast('Saved this device’s campaigns to your account');
        } else if (result.kind === 'hydrated') {
          pushToast('Loaded your campaigns from the cloud');
        } else if (result.kind === 'offline') {
          pushToast('Working offline — this device is still saving locally');
        }
        /*
         * After the sync decision, so a pulled-down campaign from a device
         * that has not updated yet gets migrated too. Content-addressed, so
         * re-running is a no-op rather than a duplicate.
         */
        await migrateInlinePortraits().catch((err) => {
          console.warn(
            'Portrait migration failed; inline portraits still render',
            err instanceof Error ? err.message : err,
          );
        });
      } catch (err) {
        console.warn(
          'Cloud sync failed',
          err instanceof Error ? err.message : err,
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, userId]);

  const onResolved = useCallback(() => setConflict(null), []);

  if (!ready) {
    return (
      <>
        <BootScreen message="Loading your table…" />
        <ToastHost />
      </>
    );
  }

  // The app renders behind the dialog so the DM can see which copy is on screen
  // while deciding, but the dialog has no dismiss path until they pick.
  return (
    <>
      {children}
      {conflict && (
        <CloudConflictDialog conflict={conflict} onResolved={onResolved} />
      )}
    </>
  );
}
