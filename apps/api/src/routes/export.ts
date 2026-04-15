import { Hono } from 'hono';
import { getLatestSnapshot, getTransactionHistory } from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const exportRoutes = new Hono<{ Variables: AppVariables }>();

function toCsvRow(fields: (string | number | null)[]): string {
  return fields
    .map((f) => {
      const s = f == null ? '' : String(f);
      // Escape double quotes and wrap in quotes if needed
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

/**
 * GET /api/export/portfolio.csv
 * Download current portfolio holdings as CSV.
 */
exportRoutes.get('/portfolio.csv', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const snapshot = await getLatestSnapshot(db, userId);

    const date = snapshot?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const rows: string[] = [
      toCsvRow(['Name', 'ISIN', 'AssetType', 'Quantity', 'PriceCents', 'ValueCents', 'Exchange', 'Date']),
    ];

    for (const h of snapshot?.holdings ?? []) {
      rows.push(
        toCsvRow([h.name, h.isin, h.assetType, h.quantity, h.priceCents, h.valueCents, h.exchange, date]),
      );
    }

    const csv = rows.join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="portfolio-${date}.csv"`);
    return c.body(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/export/transactions.csv
 * Download full transaction history as CSV.
 */
exportRoutes.get('/transactions.csv', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const txs = await getTransactionHistory(db, userId);

    const date = new Date().toISOString().slice(0, 10);
    const rows: string[] = [
      toCsvRow(['Date', 'Action', 'Asset', 'ISIN', 'Quantity', 'PriceCents', 'FeeCents', 'Exchange']),
    ];

    for (const tx of txs) {
      rows.push(
        toCsvRow([tx.date.slice(0, 10), tx.action, tx.asset, tx.isin, tx.quantity, tx.priceCents, tx.feeCents, tx.exchange]),
      );
    }

    const csv = rows.join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="transactions-${date}.csv"`);
    return c.body(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export error';
    return c.json({ data: null, error: message }, 500);
  }
});
