/* Manejo de notificaciones push (con la app cerrada o en segundo plano).
   Este archivo se importa dentro del service worker de la PWA (ver
   vite.config.ts → workbox.importScripts). El SERVIDOR (Edge Function
   'enviar-push') envía un mensaje y aquí lo mostramos como notificación. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Red de Esperanza'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [120, 60, 120],
    tag: data.tag || undefined, // agrupa avisos del mismo tipo
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((lista) => {
        // Si ya hay una pestaña abierta, la enfocamos y navegamos.
        for (const c of lista) {
          if ('focus' in c) {
            if ('navigate' in c) c.navigate(url)
            return c.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
      }),
  )
})
