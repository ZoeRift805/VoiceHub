self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'VoiceHub', {
      body: data.body || '',
      icon: '/images/logo-144.png',
      badge: '/images/logo-144.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      silent: false,
      timestamp: Date.now(),
      data: { path: data.path || '/?tab=notification' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawPath = event.notification.data && event.notification.data.path
  const targetUrl = new URL(rawPath || '/', self.location.origin)
  const safeUrl = targetUrl.origin === self.location.origin ? targetUrl.href : self.location.origin

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        const existingClient = windowClients.find(
          (client) => new URL(client.url).origin === self.location.origin
        )
        if (existingClient) {
          await existingClient.navigate(safeUrl)
          return existingClient.focus()
        }
        return self.clients.openWindow(safeUrl)
      })
  )
})
