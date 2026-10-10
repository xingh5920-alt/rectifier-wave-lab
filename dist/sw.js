// Retire the former offline app so previously saved pages can return online.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('waveform-lab-offline-')).map(name => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    await self.registration.unregister();
    await Promise.allSettled(clients.filter(client => client.url.startsWith(self.registration.scope)).map(client => client.navigate(client.url)));
  })());
});
