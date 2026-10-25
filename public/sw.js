// Pergunta da Hora — service worker: recebe as notificações e abre o app ao tocar.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let msg = {}
  try {
    msg = evento.data ? evento.data.json() : {}
  } catch {
    msg = { corpo: evento.data ? evento.data.text() : '' }
  }
  const titulo = msg.titulo || 'Pergunta da Hora'
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: msg.corpo || 'Tem pergunta nova no ar!',
      icon: '/icone-192.png',
      badge: '/icone-badge.png',
      tag: msg.tag || 'quiz',
      renotify: true,
      requireInteraction: msg.tag === 'rodada',
      vibrate: [200, 100, 200],
      data: { url: msg.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && 'focus' in j) return j.focus()
      }
      return self.clients.openWindow(destino)
    }),
  )
})
