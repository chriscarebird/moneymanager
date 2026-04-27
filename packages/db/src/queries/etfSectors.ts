import type { Client } from '@libsql/client';

export interface EtfSectorRow {
  isin: string;
  ticker: string;
  isBond: boolean;
  sectors: Record<string, number>;
  source: string;
  updatedAt: string;
}

export async function getEtfSectors(client: Client): Promise<EtfSectorRow[]> {
  const result = await client.execute(
    'SELECT isin, ticker, is_bond, sectors, source, updated_at FROM etf_sectors',
  );
  return result.rows.map((row) => ({
    isin: row['isin'] as string,
    ticker: row['ticker'] as string,
    isBond: Number(row['is_bond']) === 1,
    sectors: JSON.parse((row['sectors'] as string | null) ?? '{}') as Record<string, number>,
    source: row['source'] as string,
    updatedAt: row['updated_at'] as string,
  }));
}

export async function upsertEtfSector(client: Client, row: EtfSectorRow): Promise<void> {
  await client.execute({
    sql: `
      INSERT INTO etf_sectors (isin, ticker, is_bond, sectors, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (isin) DO UPDATE SET
        ticker = excluded.ticker,
        is_bond = excluded.is_bond,
        sectors = excluded.sectors,
        source = excluded.source,
        updated_at = excluded.updated_at
    `,
    args: [
      row.isin,
      row.ticker,
      row.isBond ? 1 : 0,
      JSON.stringify(row.sectors),
      row.source,
      row.updatedAt,
    ],
  });
}
