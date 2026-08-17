/* Service worker: offline shell + install.

   Bump CACHE_VERSION on every deploy. The app prompts before activating a new
   worker (see application.js) rather than swapping itself out mid-session. */

const CACHE_VERSION = 'habits-v2';

// Relative to the worker's own scope, so this works at any deploy subpath.
const SHELL = [
  './',
  'index.html',
  'week.html',
  'history.html',
  'settings.html',
  'manifest.webmanifest',

  'assets/css/fonts.css',
  'assets/css/tokens.css',
  'assets/css/base.css',
  'assets/css/app.css',

  'assets/js/application.js',
  'assets/js/vendor/turbo.js',
  'assets/js/vendor/stimulus.js',
  'assets/js/controllers/daysheet.js',
  'assets/js/controllers/history.js',
  'assets/js/controllers/home.js',
  'assets/js/controllers/planner.js',
  'assets/js/controllers/settings.js',
  'assets/js/controllers/topbar.js',
  'assets/js/controllers/wheel.js',
  'assets/js/lib/app.js',
  'assets/js/lib/dates.js',
  'assets/js/lib/dom.js',
  'assets/js/lib/reminders.js',
  'assets/js/lib/rules.js',
  'assets/js/lib/store.js',

  'assets/fonts/bebas-neue-latin.woff2',
  'assets/fonts/inter-latin.woff2',
  'assets/fonts/jetbrains-mono-latin.woff2',

  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
];

const url = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll is all-or-nothing; add individually so one bad path can't
      // block the whole install.
      Promise.all(
        SHELL.map((path) =>
          cache.add(new Request(url(path), { cache: 'reload' }))
            .catch((err) => console.warn('[sw] skipped', path, err)),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Navigations: serve the cached page, fall back to the network, and if both
  // fail land on the home screen rather than the browser's offline error.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || fetch(request))
        .catch(() => caches.match(url('index.html'))),
    );
    return;
  }

  // Everything else is a versioned static asset: cache first, then network,
  // populating the cache as we go.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
