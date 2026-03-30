import type { Client } from '@libsql/client';
import { randomUUID } from 'crypto';

export async function getCashBalance(
  client: Client,
  userId: string,
): Promise<{ amountCents: number; dateUpdated: string } | null> {
  const result = await client.execute({
    sql: `
      SELECT amount_cents, date_updated
      FROM cash_balances
      WHERE user_id = ?
      ORDER BY date_updated DESC
      LIMIT 1
    `,
    args: [userId],
  });

  const row = result.rows[0];
  if (!row) return null;
  return {
    amountCents: row['amount_cents'] as number,
    dateUpdated: row['date_updated'] as string,
  };
}

export async function setCashBalance(
  client: Client,
  userId: string,
  amountCents: number,
): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.execute({
    sql: `
      INSERT INTO cash_balances (id, user_id, amount_cents, date_updated)
      VALUES (?, ?, ?, ?)
    `,
    args: [id, userId, amountCents, now],
  });
}
