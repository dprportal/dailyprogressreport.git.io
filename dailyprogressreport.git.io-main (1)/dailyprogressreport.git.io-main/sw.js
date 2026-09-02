/* =============================================
   DPR Management — Service Worker
   App-shell caching for speed & offline.
   Firebase Auth/Firestore traffic is never intercepted.
   ============================================= */
const CACHE = 'dpr-shell-v2';

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'css/dashboard.css',
  'css/forms.css',
  'css/admin.css',
  'js/firebase.js',
  'js/auth.js',
  'js/app.js',
  'js/dpr.js',
  'js/dashboard.js',
  'js/engineers.js',
  'js/reports.js',
  'js/field-editor.js',
  'js/dropdowns.js',
  'js/export.js',
  'og-image.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Requests that must always hit the network (dynamic / auth-bearing)
function isBypass(url) {
  return /\/firebasejs\//.test(url) ||
         /firestore\.googleapis\.com/.test(url) ||
         /identitytoolkit\.googleapis\.com/.test(url) ||
         /securetoken\.googleapis\.com/.test(url) ||
         /firebaseinstallations\.googleapis\.com/.test(url) ||
         /google-analytics\.com/.test(url) ||
         /googletagmanager\.com/.test(url) ||
         /firebaselogging/.test(url);
}

// Static third-party libraries / fonts — safe to cache (stale-while-revalidate)
function isCDN(url) {
  return /cdnjs\.cloudflare\.com/.test(url) ||
         /fonts\.googleapis\.com/.test(url) ||
         /fonts\.gstatic\.com/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (isBypass(url)) return; // let the browser handle it normally

  // App navigations: network-first, fall back to cached shell when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  const sameOrigin = url.indexOf(self.location.origin) === 0;

  if (sameOrigin) {
    // Cache-first for our own static assets
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  if (isCDN(url)) {
    // Stale-while-revalidate for fonts / libraries
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
  // Everything else: default network handling
});
