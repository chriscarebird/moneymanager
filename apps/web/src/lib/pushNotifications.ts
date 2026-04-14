/**
 * Web Push registration helper — Phase 2C.
 * Requests permission, subscribes via the Push API, and registers with the server.
 */

const SUBSCRIBE_URL = '/api/notifications/subscribe';
const VAPID_KEY_URL = '/api/notifications/vapid-public-key';

/** Convert a base64url string to a Uint8Array (needed by pushManager.subscribe). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/** Returns the current push permission state without requesting. */
export function getPushPermissionState(): PushPermissionState {
  if (!('Notification' in window)) return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

/** Fetch the VAPID public key from the server. */
async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(VAPID_KEY_URL, { credentials: 'include' });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { publicKey?: string } };
    return json.data?.publicKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Request push permission, subscribe via the Push API, and register with the server.
 * Returns true on success, false if permission denied or unsupported.
 */
export async function registerPushNotifications(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Push notifications not supported');
    return false;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    // Get the active service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let sub = await registration.pushManager.getSubscription();

    if (!sub) {
      const vapidKey = await fetchVapidPublicKey();
      if (!vapidKey) {
        console.warn('VAPID key not available — push notifications disabled');
        return false;
      }
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });
    }

    // Register subscription with the server
    const subJson = sub.toJSON();
    const res = await fetch(SUBSCRIBE_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: subJson.keys?.['p256dh'] ?? '',
          auth: subJson.keys?.['auth'] ?? '',
        },
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}

/** Unsubscribe from push notifications and remove from server. */
export async function unregisterPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    await fetch('/api/notifications/unsubscribe', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    console.error('Push unregister failed:', err);
  }
}
