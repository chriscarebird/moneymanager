import type { Client } from '@libsql/client';
import { randomUUID } from 'crypto';
import type { TargetAllocation } from '@investpilot/core';

export async function getTargetAllocations(
  client: Client,
  userId: string,
): Promise<TargetAllocation[]> {
  const result = await client.execute({
    sql: `
      SELECT id, asset_class, etf_isin, etf_name, target_pct, exchange, is_free_etf, active
      FROM target_allocations
      WHERE user_id = ?
      ORDER BY target_pct DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    assetClass: row['asset_class'] as string,
    etfIsin: row['etf_isin'] as string,
    etfName: row['etf_name'] as string,
    targetPct: row['target_pct'] as number,
    exchange: row['exchange'] as string,
    isFreeEtf: (row['is_free_etf'] as number) === 1,
    active: (row['active'] as number) === 1,
  }));
}

export async function upsertTargetAllocation(
  client: Client,
  userId: string,
  allocation: Omit<TargetAllocation, 'id'> & { id?: string },
): Promise<string> {
  const id = allocation.id ?? randomUUID();
  await client.execute({
    sql: `
      INSERT INTO target_allocations
        (id, user_id, asset_class, etf_isin, etf_name, target_pct, exchange, is_free_etf, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        asset_class = excluded.asset_class,
        etf_isin    = excluded.etf_isin,
        etf_name    = excluded.etf_name,
        target_pct  = excluded.target_pct,
        exchange    = excluded.exchange,
        is_free_etf = excluded.is_free_etf,
        active      = excluded.active
    `,
    args: [
      id,
      userId,
      allocation.assetClass,
      allocation.etfIsin,
      allocation.etfName,
      allocation.targetPct,
      allocation.exchange,
      allocation.isFreeEtf ? 1 : 0,
      allocation.active ? 1 : 0,
    ],
  });
  return id;
}

export async function deleteTargetAllocation(client: Client, id: string): Promise<void> {
  await client.execute({ sql: 'DELETE FROM target_allocations WHERE id = ?', args: [id] });
}
