'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      // Home-screen PWAs are often resumed rather than freshly navigated, so
      // the browser's own (infrequent) update check isn't enough — ask again
      // every time the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    })

    // A new service worker taking control doesn't reload the already-open
    // page on its own, so the old JS keeps running until we force it.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }, [])

  return null
}
