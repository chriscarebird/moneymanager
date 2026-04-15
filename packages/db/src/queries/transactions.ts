import type { Client } from '@libsql/client';
import type { TransactionHistory } from '@investpilot/core';

/**
 * Get transaction history for a user (most recent first).
 */
export async function getTransactionHistory(
  client: Client,
  userId: string,
  limit = 200,
): Promise<TransactionHistory[]> {
  const result = await client.execute({
    sql: `
      SELECT id, date, action, asset, isin, quantity, price_cents, fee_cents, exchange
      FROM transaction_history
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    date: row['date'] as string,
    action: row['action'] as 'buy' | 'sell',
    asset: row['asset'] as string,
    isin: (row['isin'] as string | null) ?? '',
    quantity: Number(row['quantity']),
    priceCents: Number(row['price_cents']),
    feeCents: Number(row['fee_cents']),
    exchange: row['exchange'] as string,
  }));
}

/**
 * Insert a transaction record.
 */
export async function insertTransaction(
  client: Client,
  userId: string,
  id: string,
  tx: Omit<TransactionHistory, 'id'>,
): Promise<void> {
  await client.execute({
    sql: `
      INSERT INTO transaction_history (id, user_id, date, action, asset, isin, quantity, price_cents, fee_cents, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      userId,
      tx.date,
      tx.action,
      tx.asset,
      tx.isin,
      tx.quantity,
      tx.priceCents,
      tx.feeCents,
      tx.exchange,
    ],
  });
}
