/* Service worker for “สุ่มคู่ลงสนาม”.
   Two jobs: make the app installable on Android, and keep it usable in a gym
   with no signal. Everything here is static, so the whole app fits in a cache. */

var VERSION = 'v3';
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

// The only outside origin the app asks for is the font CDN. Everything else is
// served from here. A request to anywhere else is not the worker's business:
// it goes to the network untouched and is never written to the device.
var FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

function ourOrigin(url) {
  return url.origin === self.location.origin;
}

function knownOrigin(url) {
  return ourOrigin(url) || FONT_ORIGINS.indexOf(url.origin) !== -1;
}

// An opaque response has no status to read, so "did this work?" cannot be asked
// of it. That is fine for the font files, which are requested no-cors and come
// back opaque by design. It is not fine for our own origin, where a status is
// always there and an error page must never be kept: cached once, it would be
// served to the installed app forever.
function worthKeeping(res, url) {
  if (!res) return false;
  if (res.type === 'opaque') return !ourOrigin(url);
  return res.ok === true;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return; // not a URL we can reason about, so not one we will cache
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // The page comes from the network whenever there is one, so a new deploy
  // shows up on the next launch instead of being pinned by the cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          // Only a real page from our own origin may become the offline shell.
          // A 404, a sign-in wall, or anything redirected off-origin would
          // otherwise be stored as "the app" and shown on every later launch
          // with no signal, with no way for anyone to clear it.
          if (res && res.ok && res.type === 'basic') {
            var copy = res.clone();
            caches.open(SHELL).then(function (cache) { cache.put(PAGE, copy); });
          }
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

  // Anything from somewhere unexpected is passed through without being kept.
  if (!knownOrigin(url)) return;

  // Icons and the Google Fonts files: from cache first, then kept for next time.
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (worthKeeping(res, url)) {
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
