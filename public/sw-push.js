/* Push, Notification, SWR Revalidation & Background Sync handlers loaded by the PWA Service Worker (iOS 16.4+ & Android/Desktop compatible) */

const RUMO_SWR_CACHE = 'rumo-api-transactions-swr-v1';
const RUMO_SYNC_TAG = 'rumo-offline-sync';

function notifyClients(message) {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        clientList[i].postMessage(message);
      }
    });
}

/* Push notifications */
self.addEventListener('push', function (event) {
  let payload = {
    title: 'Rumo — Controle de Despesas',
    body: 'Você tem uma atualização no seu controle financeiro.',
    url: '/',
    tag: 'rumo-push',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        url: parsed.url || '/',
        tag: parsed.tag || 'rumo-push',
      };
    } catch (e) {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/rumo-glass-192.png',
      badge: '/icons/rumo-glass-192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

/* Native Background Sync API fallback (Chromium/Android) — coordinates with window SyncManager */
self.addEventListener('sync', function (event) {
  if (event.tag === RUMO_SYNC_TAG) {
    event.waitUntil(
      notifyClients({
        type: 'RUMO_SYNC_TRIGGER',
        source: 'background-sync',
      })
    );
  }
});

/* Explicit cache revalidation & proactive warm-up triggered by the app before/after online transitions */
self.addEventListener('message', function (event) {
  const data = event.data || {};

  if (data.type === 'RUMO_REVALIDATE_URL' && typeof data.url === 'string') {
    const targetUrl = data.url;
    event.waitUntil(
      caches.open(RUMO_SWR_CACHE).then(function (cache) {
        return cache.match(targetUrl).then(function (cachedRes) {
          const prevDigest = cachedRes ? cachedRes.headers.get('X-Rumo-Digest') : null;
          return fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          })
            .then(function (networkRes) {
              if (networkRes && networkRes.ok) {
                const nextDigest = networkRes.headers.get('X-Rumo-Digest');
                const cloned = networkRes.clone();
                return cache.put(targetUrl, cloned).then(function () {
                  if (prevDigest && nextDigest && prevDigest !== nextDigest) {
                    return notifyClients({
                      type: 'RUMO_SWR_REVALIDATED',
                      url: targetUrl,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                  return undefined;
                });
              }
              return undefined;
            })
            .catch(function () {
              // Still offline — retain existing freshest cached entry
            });
        });
      })
    );
  }
});
