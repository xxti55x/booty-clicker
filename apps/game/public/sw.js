/**
 * Booty Clicker Service Worker (V2-3) — offline ab dem ERSTEN Besuch.
 *
 * Der Install-Precache kennt keine Build-Hashes, er LIEST sie: index.html wird
 * geholt und auf `assets/`-Referenzen geparst (JS + CSS), das CSS auf seine
 * `url()`-Assets (Font), das JS auf die `avatars/`-Thumbnails. Damit liegt der
 * komplette Auslieferungs-Satz im Cache, BEVOR die Seite den Worker übernimmt —
 * die Lücke „Shell-Fetches liefen vor der SW-Übernahme am Cache vorbei" (im
 * Offline-Headless-Test genau so beobachtet: Loader hing) ist geschlossen.
 *
 * Laufzeit-Strategie nach dem Vite-Build-Kontrakt:
 *  · `assets/` ist content-gehasht ⇒ Cache-first für immer; neue Builds bringen
 *    neue Hashes, `activate` räumt alte Caches weg.
 *  · Navigationen (index.html) ⇒ Network-first mit Cache-Fallback — online
 *    gewinnt immer der frische Build, offline trägt die letzte Version.
 *  · Rest aus `public/` ⇒ Stale-while-revalidate.
 *
 * Saves liegen in localStorage und gehören dem Spiel — dieser Worker cached
 * ausschließlich Auslieferung, nie Spielstand; Cross-Origin (API/Leaderboard)
 * wird nie angefasst.
 *
 * `ignoreVary` überall: der Server hängt `Vary: Origin` an die Assets, und die
 * `crossorigin`-Module-Requests der Seite tragen einen Origin-Header, den die
 * addAll-gespeicherten Einträge nicht haben — ohne `ignoreVary` verfehlte
 * JEDER Offline-Match die eigenen Einträge (headless genau so beobachtet:
 * ERR_FAILED auf das gecachte Modul). Same-origin + URL-adressiert ⇒ Vary zu
 * ignorieren ist hier semantisch korrekt.
 */
const CACHE = 'booty-clicker-v2';

const SHELL = [
  '.',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
];

/** Relative Referenz → absolute URL im eigenen Scope. */
function inScope(ref) {
  return new URL(ref, self.registration.scope).href;
}

async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const html = await (await c.match(inScope('.'), { ignoreVary: true })).text();
  // Gehashte Build-Einstiege aus dem HTML (JS-Modul + CSS).
  const refs = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => m[1]);
  await c.addAll(refs.map(inScope));
  // Sekundär-Assets: Font aus dem CSS, Avatar-Thumbnails aus dem JS.
  const secondary = new Set();
  for (const ref of refs) {
    const res = await c.match(inScope(ref), { ignoreVary: true });
    if (!res) continue;
    const text = await res.text();
    if (ref.endsWith('.css')) {
      for (const m of text.matchAll(/url\(\.?\/?([\w.-]+\.(?:woff2?|png|jpg|webp))\)/g)) {
        secondary.add(`assets/${m[1]}`);
      }
    } else {
      for (const m of text.matchAll(/avatars\/[\w.-]+\.(?:jpg|png|webp)/g)) {
        secondary.add(m[0]);
      }
    }
  }
  await Promise.all([...secondary].map((u) => c.add(inScope(u)).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Cache-first: unveränderliche, gehashte Build-Assets. */
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

/** Network-first: der veränderliche Einstieg (Navigationen). */
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(inScope('.'), res.clone());
    return res;
  } catch {
    const cached =
      (await caches.match(req, { ignoreVary: true })) ??
      (await caches.match(inScope('.'), { ignoreVary: true }));
    if (cached) return cached;
    throw new Error('offline und nichts im Cache');
  }
}

/** Stale-while-revalidate: public/-Statisches (Icons, Avatare). */
async function staleWhileRevalidate(req) {
  const cached = await caches.match(req, { ignoreVary: true });
  const refresh = fetch(req)
    .then(async (res) => {
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached ?? (await refresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API/Leaderboard: nie cachen
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
