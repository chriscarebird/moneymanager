/// <reference lib="WebWorker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// ── Precache (injected by vite-plugin-pwa) ───────────────────────────────────

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Allow the waiting SW to become active immediately when the page requests it
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ── API cache: NetworkFirst, 1-hour TTL ──────────────────────────────────────

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 10 }),
);

// ── SPA navigation fallback ──────────────────────────────────────────────────

registerRoute(new NavigationRoute(async () => {
  const cache = await caches.open('workbox-precache-v2');
  const response = await cache.match('/index.html');
  return response ?? new Response('Not found', { status: 404 });
}));

// ── Push notification handler (Alert 1 / 2 / 3) ──────────────────────────────

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string; icon?: string };
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: 'InvestPilot', body: event.data.text() };
  }

  const title = payload.title ?? 'InvestPilot';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url ?? '/' },
    vibrate: [200, 100, 200],
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: open or focus the app ─────────────────────────────────

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl: string = (event.notification.data as { url?: string }).url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // If app is already open, focus and navigate
        for (const client of clients) {
          if ('focus' in client) {
            return client.focus().then(() => {
              if ('navigate' in client) {
                return (client as WindowClient).navigate(targetUrl);
              }
            });
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
