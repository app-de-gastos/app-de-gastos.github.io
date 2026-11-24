const C = 'gastos-3', F = ['./', 'index.html', 'style.css', 'calc.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(F)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('gastos-') && x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
// Primero la red (para recibir mejoras); sin señal, la copia guardada.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
