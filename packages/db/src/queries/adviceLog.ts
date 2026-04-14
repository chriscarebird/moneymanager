import type { Client } from '@libsql/client';
import type { AdviceLog, AdviceType } from '@investpilot/core';
import { randomUUID } from 'crypto';

export async function insertAdviceLog(
  client: Client,
  userId: string,
  entry: {
    type: AdviceType;
    recommendationText: string;
    pricesJson?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const date = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO advice_log (id, user_id, date, type, recommendation_text, was_followed, stale, prices_json)
      VALUES (?, ?, ?, ?, ?, NULL, 0, ?)
    `,
    args: [id, userId, date, entry.type, entry.recommendationText, entry.pricesJson ?? null],
  });
  return id;
}

export async function getAdviceLog(
  client: Client,
  userId: string,
  limit = 20,
): Promise<(AdviceLog & { stale: boolean; pricesJson: string | null })[]> {
  const result = await client.execute({
    sql: `
      SELECT id, date, type, recommendation_text, was_followed, stale, prices_json
      FROM advice_log
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    date: row['date'] as string,
    type: row['type'] as AdviceType,
    recommendationText: row['recommendation_text'] as string,
    wasFollowed: row['was_followed'] == null ? null : (row['was_followed'] as number) === 1,
    stale: (row['stale'] as number) === 1,
    pricesJson: row['prices_json'] as string | null,
  }));
}

export async function markAdviceLogFollowed(
  client: Client,
  adviceId: string,
  wasFollowed: boolean,
): Promise<void> {
  await client.execute({
    sql: 'UPDATE advice_log SET was_followed = ? WHERE id = ?',
    args: [wasFollowed ? 1 : 0, adviceId],
  });
}

export async function markStaleAdvice(client: Client, userId: string): Promise<void> {
  // Mark advice older than 48 hours as stale
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await client.execute({
    sql: `UPDATE advice_log SET stale = 1 WHERE user_id = ? AND date < ? AND was_followed IS NULL`,
    args: [userId, cutoff],
  });
}
