// Service worker. Phase 1 only uses it to receive files shared to the app on
// Android ("Open with" / Share). The file never touches the network: it is
// read here on the device and handed to the page through Cache Storage.
// Offline caching of the app itself arrives in Phase 7.

const SHARE_CACHE = 'share-target';
const SHARE_CACHE_KEY = 'shared-file';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;

  event.respondWith(
    (async () => {
      const appUrl = new URL('./?share-target=1', self.registration.scope).href;
      try {
        const form = await event.request.formData();
        const file = form.getAll('file').find((f) => f instanceof File);
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_CACHE_KEY,
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/pdf',
                'x-file-name': encodeURIComponent(file.name),
              },
            }),
          );
        }
      } catch {
        // Fall through to the app; it shows the empty state.
      }
      return Response.redirect(appUrl, 303);
    })(),
  );
});
