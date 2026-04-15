import type { Client } from '@libsql/client';
import type { DeGiroETFList } from '@investpilot/core';

/**
 * Get DeGiro ETF scoring data for a list of ISINs.
 * Used to display spread / volume / core-selection badges on trade recommendations.
 */
export async function getDeGiroEtfScores(
  client: Client,
  isins: string[],
): Promise<DeGiroETFList[]> {
  if (isins.length === 0) return [];

  const placeholders = isins.map(() => '?').join(', ');
  const result = await client.execute({
    sql: `
      SELECT isin, name, exchange, is_core_selection, typical_spread_bps, avg_daily_volume
      FROM degiro_etf_list
      WHERE isin IN (${placeholders})
    `,
    args: isins,
  });

  return result.rows.map((row) => ({
    isin: row['isin'] as string,
    name: row['name'] as string,
    exchange: row['exchange'] as string,
    isCoreSelection: Boolean(row['is_core_selection']),
    typicalSpreadBps: row['typical_spread_bps'] != null ? Number(row['typical_spread_bps']) : null,
    avgDailyVolume: row['avg_daily_volume'] != null ? Number(row['avg_daily_volume']) : null,
  }));
}
