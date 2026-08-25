self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const options = {
    body: data.body ?? '',
    icon: '/icons/icon-192.png?v=2',
    badge: '/icons/icon-192.png?v=2',
    data: { url: data.url ?? '/' },
  }

  if (typeof data.tag === 'string' && data.tag) {
    options.tag = data.tag
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Koko', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }
        return clients.openWindow(event.notification.data?.url ?? '/')
      })
  )
})
