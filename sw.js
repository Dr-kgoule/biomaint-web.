/* BioMaint IA — service worker (fonctionnement hors ligne + mises à jour)
   À CHAQUE NOUVELLE VERSION : changer VERSION ci-dessous (même numéro que about.json). */
const VERSION = "1.2.5";
const CACHE = "biomaint-" + VERSION;
const CORE = [
  "./", "index.html", "styles.css", "intro.js", "renderer.js", "bridge-android.js", "web-extra.js",
  "jspdf.umd.min.js", "pdf.min.js", "pdf.worker.min.js", "about.json", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "assets/logo.png",
  "assets/cobas.webp", "assets/moniteur.webp", "assets/ventilateur.webp", "assets/echographe.webp",
  "assets/analyseur.webp", "assets/sterilisateur.webp", "assets/centrifugeuse.webp", "assets/anesthesie.webp",
  "assets/oxymetre.webp", "assets/kenza.webp", "assets/ionogramme.webp", "assets/bistouri.webp"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("biomaint-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Fichiers du site : cache d abord (rapide, hors ligne). Appels vers d autres sites (API IA) : jamais interceptés. */
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => r.mode === "navigate" ? caches.match("index.html") : Response.error())));
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("./index.html")));
});
