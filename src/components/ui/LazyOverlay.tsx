import { Suspense, type ReactNode } from 'react';

/**
 * Wrapper for the heavy, modal-gated surfaces — creature and spell editors, the
 * encounter library, the first-run wizard, campaign settings. None of them are
 * on screen when the app boots, but as static imports they all rode in the entry
 * chunk, so a DM waiting to see round 1 was downloading the level-up form.
 *
 * The fallback is deliberately quiet: these open on a click, the chunk is small
 * and same-origin, and a spinner that flashes for 30 ms reads as a glitch.
 */
export function LazyOverlay({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="fixed inset-0 z-50 bg-black/40"
          role="presentation"
          aria-busy="true"
        />
      }
    >
      {children}
    </Suspense>
  );
}
