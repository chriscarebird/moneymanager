import type { Client } from '@libsql/client';
import { randomUUID } from 'crypto';

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

export async function savePushSubscription(
  client: Client,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  const id = randomUUID();
  await client.execute({
    sql: `
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth
    `,
    args: [id, userId, sub.endpoint, sub.p256dh, sub.auth],
  });
}

export async function getPushSubscriptions(
  client: Client,
  userId: string,
): Promise<PushSubscription[]> {
  const result = await client.execute({
    sql: `
      SELECT id, user_id, endpoint, p256dh, auth, created_at
      FROM push_subscriptions
      WHERE user_id = ?
    `,
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: row['id'] as string,
    userId: row['user_id'] as string,
    endpoint: row['endpoint'] as string,
    p256dh: row['p256dh'] as string,
    auth: row['auth'] as string,
    createdAt: row['created_at'] as string,
  }));
}

export async function deletePushSubscription(
  client: Client,
  endpoint: string,
): Promise<void> {
  await client.execute({
    sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
    args: [endpoint],
  });
}

export async function getAlertSuppression(
  client: Client,
  userId: string,
  alertType: string,
): Promise<{ suppressedUntil: string } | null> {
  const result = await client.execute({
    sql: `
      SELECT suppressed_until FROM alert_suppressions
      WHERE user_id = ? AND alert_type = ? AND suppressed_until > ?
    `,
    args: [userId, alertType, new Date().toISOString()],
  });
  if (result.rows.length === 0) return null;
  return { suppressedUntil: result.rows[0]!['suppressed_until'] as string };
}

export async function upsertAlertSuppression(
  client: Client,
  userId: string,
  alertType: string,
  suppressedUntilMs: number,
  reason?: string,
): Promise<void> {
  const id = randomUUID();
  const suppressedUntil = new Date(suppressedUntilMs).toISOString();
  await client.execute({
    sql: `
      INSERT INTO alert_suppressions (id, user_id, alert_type, suppressed_until, reason)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, alert_type) DO UPDATE SET
        suppressed_until = excluded.suppressed_until,
        reason = excluded.reason
    `,
    args: [id, userId, alertType, suppressedUntil, reason ?? null],
  });
}
