import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse } from '@investpilot/core';
import {
  getPendingNotifications,
  savePushSubscription,
  deletePushSubscription,
  getPushSubscriptions,
} from '@investpilot/db';
import { getDbClient } from '../db.js';
import { sendPushToUser } from '../services/pushSender.js';
import { runSchedulerForUser } from '../services/notificationScheduler.js';
import type { AppVariables } from '../types.js';

export const notificationsRoutes = new Hono<{ Variables: AppVariables }>();

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * GET /api/notifications/vapid-public-key
 * Returns the VAPID public key for push subscription registration.
 */
notificationsRoutes.get('/vapid-public-key', (c) => {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  if (!publicKey) {
    return c.json({ data: null, error: 'Push notifications not configured' }, 503);
  }
  const response: ApiResponse<{ publicKey: string }> = {
    data: { publicKey },
    error: null,
  };
  return c.json(response, 200);
});

/**
 * POST /api/notifications/subscribe
 * Save a Web Push subscription for the authenticated user.
 */
notificationsRoutes.post('/subscribe', async (c) => {
  const userId = c.get('userId');
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = PushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: 'Invalid push subscription' }, 400);
  }

  try {
    const db = getDbClient();
    await savePushSubscription(db, userId, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    return c.json({ data: { ok: true }, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * DELETE /api/notifications/unsubscribe
 * Remove a Web Push subscription.
 */
notificationsRoutes.delete('/unsubscribe', async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: 'endpoint required' }, 400);
  }

  try {
    const db = getDbClient();
    await deletePushSubscription(db, parsed.data.endpoint);
    return c.json({ data: { ok: true }, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/notifications/subscriptions
 * List push subscriptions for the current user.
 */
notificationsRoutes.get('/subscriptions', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const subs = await getPushSubscriptions(db, userId);
    // Don't return the full keys — just endpoint + createdAt
    const safe = subs.map((s) => ({ id: s.id, endpoint: s.endpoint, createdAt: s.createdAt }));
    return c.json({ data: safe, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/notifications/pending
 * Return pending (unsent) notifications for the current user.
 */
notificationsRoutes.get('/pending', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const notifications = await getPendingNotifications(db, userId);
    return c.json({ data: notifications, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/notifications/test
 * Send a test push notification to the current user.
 */
notificationsRoutes.post('/test', async (c) => {
  try {
    const userId = c.get('userId');
    await sendPushToUser(userId, {
      title: 'InvestPilot',
      body: 'Push notifications are working!',
      url: '/',
    });
    return c.json({ data: { sent: true }, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push send error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/notifications/scheduler/run
 * Manually trigger the notification scheduler (useful for testing).
 */
notificationsRoutes.post('/scheduler/run', async (c) => {
  try {
    const userId = c.get('userId');
    const result = await runSchedulerForUser(userId);
    return c.json({ data: result, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scheduler error';
    return c.json({ data: null, error: message }, 500);
  }
});
