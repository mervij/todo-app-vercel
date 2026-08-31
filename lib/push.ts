import { savePushSubscription, deletePushSubscription } from './firestore'

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getNotificationPermission(): NotificationPermission | null {
  if (typeof Notification === 'undefined') return null
  return Notification.permission
}

// The Push API wants the VAPID public key as a raw Uint8Array, but env vars
// only carry strings — this decodes the base64url form Firebase/web-push use.
function urlBase64ToUint8Array(base64Url: string) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Requests notification permission (if needed) and subscribes this device to
// push, saving the subscription so the alarm cron job can reach it. Returns
// false if permission was denied or push isn't supported.
export async function enablePushNotifications(email: string): Promise<boolean> {
  if (!isPushSupported()) return false

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')
    return false
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }))

  await savePushSubscription(email, subscription.toJSON())
  return true
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await deletePushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
}
