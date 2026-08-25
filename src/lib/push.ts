import { postJsonWithAuth } from '@/lib/api-client'

export type PushConnectionStatus =
  | 'unsupported'
  | 'permission-required'
  | 'blocked'
  | 'connected'

let syncInFlight: Promise<PushConnectionStatus> | null = null

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i)
  }
  return buffer
}

function getUnsupportedStatus(): PushConnectionStatus | null {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return null
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js')
  return await navigator.serviceWorker.ready
}

async function createPushSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription> {
  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    ),
  })
}

async function persistPushSubscription(
  subscription: PushSubscription,
  previousEndpoint?: string
): Promise<void> {
  const json = subscription.toJSON() as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }

  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Push subscription is missing required fields')
  }

  await postJsonWithAuth('/api/push/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    ...(previousEndpoint && previousEndpoint !== json.endpoint ? { previousEndpoint } : {}),
  })
}

async function ensurePushSubscription(): Promise<PushConnectionStatus> {
  const registration = await getReadyRegistration()
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await createPushSubscription(registration)

  // Upserting the browser endpoint also rebinds it after a Koko account switch.
  await persistPushSubscription(subscription)
  return 'connected'
}

async function createAndPersistReplacement(
  registration: ServiceWorkerRegistration,
  previousEndpoint?: string
): Promise<void> {
  try {
    const subscription = await createPushSubscription(registration)
    await persistPushSubscription(subscription, previousEndpoint)
  } catch {
    // subscribe() may have succeeded before persistence failed; reuse it when possible.
    const current = await registration.pushManager.getSubscription()
    const retrySubscription = current && current.endpoint !== previousEndpoint
      ? current
      : await createPushSubscription(registration)
    await persistPushSubscription(retrySubscription, previousEndpoint)
  }
}

function ensurePushSubscriptionShared(): Promise<PushConnectionStatus> {
  if (syncInFlight) return syncInFlight

  syncInFlight = ensurePushSubscription().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

export async function syncPushSubscriptionIfGranted(): Promise<PushConnectionStatus> {
  const unsupported = getUnsupportedStatus()
  if (unsupported) return unsupported

  if (Notification.permission === 'default') return 'permission-required'
  if (Notification.permission === 'denied') return 'blocked'

  return await ensurePushSubscriptionShared()
}

export async function registerPushSubscription(): Promise<PushConnectionStatus> {
  const unsupported = getUnsupportedStatus()
  if (unsupported) return unsupported

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission

  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'permission-required'

  return await ensurePushSubscriptionShared()
}

export async function repairPushSubscription(): Promise<PushConnectionStatus> {
  const unsupported = getUnsupportedStatus()
  if (unsupported) return unsupported

  if (Notification.permission === 'default') return 'permission-required'
  if (Notification.permission === 'denied') return 'blocked'

  if (syncInFlight) {
    try {
      await syncInFlight
    } catch {
      // A user-requested repair should still get its own clean attempt.
    }
  }

  const registration = await getReadyRegistration()
  const existing = await registration.pushManager.getSubscription()
  const previousEndpoint = existing?.endpoint

  if (existing) {
    const unsubscribed = await existing.unsubscribe()
    if (!unsubscribed) {
      throw new Error('Failed to unsubscribe stale push subscription')
    }
  }

  await createAndPersistReplacement(registration, previousEndpoint)
  return 'connected'
}
