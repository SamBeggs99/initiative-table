/**
 * Service worker registration. Only in production builds — a worker caching a
 * dev server's module graph is a debugging trap, not a feature.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        /*
         * Never auto-reload. `skipWaiting` in the worker means the next
         * navigation gets the new build, which is the right moment — pulling
         * the page out from under a DM in round 4 to apply an update is
         * exactly the kind of interruption this app exists to avoid.
         */
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('A new version is ready; it will load on next open.');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('Offline support unavailable', err);
      });
  });
}
