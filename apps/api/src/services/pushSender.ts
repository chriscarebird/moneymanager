import webpush from 'web-push';
import { getPushSubscriptions, deletePushSubscription } from '@investpilot/db';
import { getDbClient } from '../db.js';

/** Lazily configure VAPID details (once per process). */
let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const email = process.env['VAPID_EMAIL'];

  if (!publicKey || !privateKey || !email) return false;

  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Send a push notification to all registered subscriptions for a user.
 * Automatically removes expired subscriptions (410 Gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapidConfigured()) {
    console.warn('VAPID not configured — push notification skipped');
    return;
  }

  const db = getDbClient();
  const subscriptions = await getPushSubscriptions(db, userId);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? '/',
            icon: payload.icon ?? '/icons/icon-192.png',
          }),
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired — clean up
          await deletePushSubscription(db, sub.endpoint).catch(() => undefined);
        } else {
          console.error(`Push send failed for endpoint ${sub.endpoint.slice(0, 40)}…:`, err);
        }
      }
    }),
  );
}

/**
 * Send a push to all users listed (broadcasts the same payload).
 */
export async function broadcastPush(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)));
}
