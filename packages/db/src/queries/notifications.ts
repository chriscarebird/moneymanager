import type { Client } from '@libsql/client';
import type { Notification } from '@investpilot/core';

/**
 * Query helpers for the notifications table.
 * Phase 2 implementation — these are typed stubs.
 */

/**
 * Get all pending (unsent) notifications for a user.
 *
 * @param client - libsql client
 * @param userId - User ID
 * @returns Array of unsent notifications ordered by scheduled_date
 */
export async function getPendingNotifications(
  client: Client,
  userId: string,
): Promise<Notification[]> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: `
      SELECT id, type, scheduled_date, sent, message
      FROM notifications
      WHERE user_id = ? AND sent = 0
      ORDER BY scheduled_date ASC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    type: row['type'] as Notification['type'],
    scheduledDate: row['scheduled_date'] as string,
    sent: (row['sent'] as number) === 1,
    message: row['message'] as string,
  }));
}

/**
 * Mark a notification as sent.
 *
 * @param client - libsql client
 * @param notificationId - Notification ID
 */
export async function markNotificationSent(client: Client, notificationId: string): Promise<void> {
  // TODO Phase 2: implement
  await client.execute({
    sql: 'UPDATE notifications SET sent = 1 WHERE id = ?',
    args: [notificationId],
  });
}

/**
 * Insert a new notification.
 *
 * @param client - libsql client
 * @param userId - User ID
 * @param notification - Notification to insert
 */
export async function insertNotification(
  client: Client,
  userId: string,
  notification: Omit<Notification, 'sent'>,
): Promise<void> {
  // TODO Phase 2: implement
  await client.execute({
    sql: `
      INSERT OR IGNORE INTO notifications (id, user_id, type, scheduled_date, message)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [
      notification.id,
      userId,
      notification.type,
      notification.scheduledDate,
      notification.message,
    ],
  });
}
