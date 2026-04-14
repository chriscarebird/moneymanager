import type { Client } from '@libsql/client';
import type { PendingTransfer } from '@investpilot/core';
import { randomUUID } from 'crypto';

export async function getPendingTransfers(
  client: Client,
  userId: string,
): Promise<PendingTransfer[]> {
  const result = await client.execute({
    sql: `
      SELECT id, source, destination, amount_usd_cents, amount_eur_cents,
             fx_rate, status, date_initiated, date_completed
      FROM pending_transfers
      WHERE user_id = ?
      ORDER BY date_initiated DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    source: row['source'] as string,
    destination: row['destination'] as string,
    amountUsdCents: row['amount_usd_cents'] as number | null,
    amountEurCents: row['amount_eur_cents'] as number | null,
    fxRate: row['fx_rate'] as number | null,
    status: row['status'] as PendingTransfer['status'],
    dateInitiated: row['date_initiated'] as string,
    dateCompleted: row['date_completed'] as string | null,
  }));
}

export async function insertTransfer(
  client: Client,
  userId: string,
  transfer: Omit<PendingTransfer, 'id' | 'status' | 'dateCompleted'>,
): Promise<string> {
  const id = randomUUID();
  await client.execute({
    sql: `
      INSERT INTO pending_transfers
        (id, user_id, source, destination, amount_usd_cents, amount_eur_cents, fx_rate,
         status, date_initiated, date_completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
    `,
    args: [
      id,
      userId,
      transfer.source,
      transfer.destination,
      transfer.amountUsdCents ?? null,
      transfer.amountEurCents ?? null,
      transfer.fxRate ?? null,
      transfer.dateInitiated,
    ],
  });
  return id;
}

export async function updateTransferStatus(
  client: Client,
  transferId: string,
  status: PendingTransfer['status'],
): Promise<void> {
  const dateCompleted = status === 'completed' ? new Date().toISOString() : null;
  await client.execute({
    sql: `
      UPDATE pending_transfers
      SET status = ?, date_completed = ?
      WHERE id = ?
    `,
    args: [status, dateCompleted, transferId],
  });
}
