/*
 * App-shell service worker. Hand-rolled rather than pulling in Workbox, since
 * the project rule is to ask before adding a dependency and the policy here is
 * three rules long.
 *
 * The manifest and version placeholders below are substituted at build time by
 * the inline plugin in vite.config.ts. This file is never shipped as-is.
 *
 * Why it exists: campaign data was already local, but the app *shell* needed
 * the network to boot. A DM whose tab got evicted mid-session, or who reloaded
 * on dead venue wifi, got nothing — despite "must be fully functional with no
 * network connection" being a stated non-negotiable.
 */

const VERSION = '__SW_VERSION__';
const SHELL_CACHE = `dm-shell-${VERSION}`;
const RUNTIME_CACHE = `dm-runtime-${VERSION}`;
const PRECACHE = __SW_MANIFEST__;

/*
 * Static hosts (and Vite's preview server) send `Vary: Origin` on assets. The
 * page's own module requests carry an Origin header, so a default
 * `caches.match` treats the cached copy as non-matching, falls through to
 * fetch(), and offline that rejects — a cached index.html with a blank page.
 * These URLs are content-hashed; there is nothing for Vary to disambiguate.
 */
const MATCH_OPTS = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('dm-') && !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

/** Vite emits content-hashed filenames, so those are safe to keep forever. */
function isImmutable(url) {
  return /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname);
}

function isFont(url) {
  return url.pathname.startsWith('/fonts/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase, Open5e, Nethys, dnd5eapi: always live. Caching a sync response
  // would silently serve a stale catalog and make "Sync" a lie.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deploy is picked up, cache as the fallback
  // that makes an offline reload work at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cached =
            (await caches.match('/index.html', MATCH_OPTS)) ??
            (await caches.match('/', MATCH_OPTS));
          return (
            cached ??
            new Response('Offline and no cached copy of the app.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }
      })(),
    );
    return;
  }

  // Hashed assets and fonts never change under a given URL: cache first, and
  // fill the cache on demand so lazily-imported chunks (editors, the encounter
  // library, the Nethys snapshots) survive going offline after first use.
  if (isImmutable(url) || isFont(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, MATCH_OPTS);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
    return;
  }

  // Everything else same-origin (icons, manifest): cache with a network refresh.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, MATCH_OPTS);
      const network = fetch(request)
        .then(async (res) => {
          if (res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        })
        .catch(() => undefined);
      return cached ?? (await network) ?? Response.error();
    })(),
  );
});
