/* Service worker for “สุ่มคู่ลงสนาม”.
   Two jobs: make the app installable on Android, and keep it usable in a gym
   with no signal. Everything here is static, so the whole app fits in a cache. */

var VERSION = 'v1';
var SHELL = 'badminton-shell-' + VERSION;
var RUNTIME = 'badminton-runtime-' + VERSION;
var PAGE = './index.html';

var SHELL_FILES = [
  './',
  PAGE,
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL)
      .then(function (cache) { return cache.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== SHELL && key !== RUNTIME) return caches.delete(key);
          return null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  // The page comes from the network whenever there is one, so a new deploy
  // shows up on the next launch instead of being pinned by the cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(SHELL).then(function (cache) { cache.put(PAGE, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(PAGE).then(function (hit) {
            return hit || caches.match('./');
          });
        })
    );
    return;
  }

  // Icons and the Google Fonts files: from cache first, then kept for next time.
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return hit; // offline and never seen: let the request fail as usual
      });
    })
  );
});
