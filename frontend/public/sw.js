self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first pass-through so live API/WebSockets stay fresh
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        payload = { body: event.data.text() };
      }
    }

    const title = payload.title || 'Antigravity Mobile';
    const body = payload.body || '';
    const convId = payload.conv_id || '';
    const permission = payload.permission || null;

    await self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: convId ? 'perm-' + convId : 'ag-test',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { conv_id: convId, permission },
      actions: permission
        ? [
            { action: 'allow', title: 'Allow Once' },
            { action: 'deny', title: 'Deny' },
          ]
        : [],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const convId = data.conv_id || '';

  event.waitUntil((async () => {
    if ((event.action === 'allow' || event.action === 'deny') && data.permission) {
      try {
        const res = await fetch('/api/agent/permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: convId || data.permission.conversation_id || '',
            trajectory_id: data.permission.trajectory_id,
            step_index: data.permission.step_index,
            allow: event.action === 'allow',
            scope: 'PERMISSION_SCOPE_ONCE',
            conv_id: convId,
            action: data.permission.action,
            target: data.permission.target,
          }),
        });
        if (res.ok) {
          return;
        }
      } catch {
        // Fall back to opening the app so the user can authenticate or respond in UI
      }
    }

    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        if (convId) {
          client.postMessage({ type: 'OPEN_CONVERSATION', conv_id: convId });
        }
        return;
      }
    }

    const targetUrl = convId ? '/?conv=' + encodeURIComponent(convId) : '/';
    await self.clients.openWindow(targetUrl);
  })());
});

