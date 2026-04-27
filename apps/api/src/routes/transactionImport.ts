import { Hono } from 'hono';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import type { ApiResponse } from '@investpilot/core';
import { bulkInsertTransactions, getEtfSectors, upsertEtfSector } from '@investpilot/db';
import type { AppVariables } from '../types.js';
import { getDbClient } from '../db.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date: string;
  action: 'buy' | 'sell';
  asset: string;
  isin: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  exchange: string;
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parseDateDutch(raw: string | number | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Number(s));
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

function parseDeGiroRows(raw: Record<string, unknown>[]): { rows: ParsedTransaction[]; skipped: number } {
  const rows: ParsedTransaction[] = [];
  let skipped = 0;
  let prevRow: ParsedTransaction | null = null;

  for (const rawRow of raw) {
    // Strip whitespace from all column names
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      row[k.trim()] = v;
    }

    const isin = String(row['ISIN'] ?? '').trim();
    const product = String(row['Product'] ?? '').trim();

    // Wrap-around row: has product text but no ISIN → merge into previous row name
    if (!isin && product && prevRow) {
      prevRow.asset = `${prevRow.asset} ${product}`.trim();
      skipped++;
      continue;
    }

    if (!isin) { skipped++; continue; }

    const aantal = toNumber(row['Aantal']);
    if (aantal === 0) { skipped++; continue; }

    // Totaal EUR sign: negative = buy (cash out), positive = sell (cash in)
    const totaalEur = toNumber(row['Totaal EUR'] ?? row['Totaal']);
    const koers = toNumber(row['Koers'] ?? row['Koers ']);
    const transactionCosts = toNumber(
      row['Transactiekosten en/of kosten van derden EUR'] ??
      row['Transactiekosten en/of kosten van derden'] ?? 0,
    );

    const action: 'buy' | 'sell' = totaalEur < 0 ? 'buy' : 'sell';
    const quantity = Math.abs(aantal);
    const priceCents = Math.round(Math.abs(koers) * 100);
    const feeCents = Math.round(Math.abs(transactionCosts) * 100);
    const date = parseDateDutch(row['Datum'] as string | number | undefined);
    const exchange = String(row['Beurs'] ?? row['Exchange'] ?? '').trim();

    const parsed: ParsedTransaction = { date, action, asset: product, isin, quantity, priceCents, feeCents, exchange };
    rows.push(parsed);
    prevRow = parsed;
  }

  return { rows, skipped };
}

// ── Router 1: mounted at /api/uploads ─────────────────────────────────────────

export const txUploadRoutes = new Hono<{ Variables: AppVariables }>();

const TransactionFileSchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
});

/**
 * POST /api/uploads/transactions
 */
txUploadRoutes.post('/transactions', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = TransactionFileSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }

  try {
    const buffer = Buffer.from(parsed.data.fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Empty workbook');
    const sheet = workbook.Sheets[sheetName]!;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const { rows, skipped } = parseDeGiroRows(rawRows);
    const response: ApiResponse<{ rows: ParsedTransaction[]; skipped: number }> = { data: { rows, skipped }, error: null };
    return c.json(response, 200);
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Parse error' }, 500);
  }
});

// ── Router 2: mounted at /api/portfolio/transactions ──────────────────────────

export const txBulkRoutes = new Hono<{ Variables: AppVariables }>();

const BulkSaveSchema = z.object({
  transactions: z.array(z.object({
    date: z.string(),
    action: z.enum(['buy', 'sell']),
    asset: z.string(),
    isin: z.string(),
    quantity: z.number(),
    priceCents: z.number().int(),
    feeCents: z.number().int(),
    exchange: z.string(),
  })),
});

/**
 * POST /api/portfolio/transactions/bulk
 */
txBulkRoutes.post('/bulk', async (c) => {
  const userId = c.get('userId');
  const db = getDbClient();
  const raw: unknown = await c.req.json();
  const parsed = BulkSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }

  try {
    const inserted = await bulkInsertTransactions(db, userId, parsed.data.transactions);
    return c.json({ data: { inserted }, error: null }, 200);
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'DB error' }, 500);
  }
});

// ── Router 3: mounted at /api/portfolio/sectors ───────────────────────────────

export const sectorRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/portfolio/sectors
 */
sectorRoutes.get('/', async (c) => {
  const db = getDbClient();
  try {
    const sectors = await getEtfSectors(db);
    return c.json({ data: sectors, error: null }, 200);
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'DB error' }, 500);
  }
});

interface FidelityResponse { sectorAllocation?: Array<{ name: string; weight: number }> }

async function fetchJustEtf(isin: string): Promise<Record<string, number> | null> {
  try {
    const url = `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestPilot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sectorPattern = /class="[^"]*bar-label[^"]*"[^>]*>([^<]+)<\/[^>]+>[\s\S]*?(\d+\.\d+)\s*%/g;
    const result: Record<string, number> = {};
    let m: RegExpExecArray | null;
    while ((m = sectorPattern.exec(html)) !== null) {
      const name = m[1]!.trim();
      const pct = parseFloat(m[2]!);
      if (name && pct > 0) result[name] = pct;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

async function fetchFidelity(isin: string): Promise<Record<string, number> | null> {
  try {
    const url = `https://www.fidelity.co.uk/factsheet-data/factsheet/${encodeURIComponent(isin)}/portfolio`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestPilot/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as FidelityResponse;
    if (!json.sectorAllocation) return null;
    const result: Record<string, number> = {};
    for (const s of json.sectorAllocation) {
      if (s.name && s.weight > 0) result[s.name] = s.weight;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

const RefreshSectorsSchema = z.object({ isins: z.array(z.string().min(1)) });

/**
 * POST /api/portfolio/sectors/refresh
 */
sectorRoutes.post('/refresh', async (c) => {
  const db = getDbClient();
  const raw: unknown = await c.req.json();
  const parsed = RefreshSectorsSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }

  const existing = await getEtfSectors(db);
  const existingMap = new Map(existing.map((r) => [r.isin, r]));

  let updated = 0;
  for (const isin of parsed.data.isins) {
    const current = existingMap.get(isin);
    if (current?.isBond) continue;

    let sectors = await fetchJustEtf(isin);
    let source = 'justetf';

    if (!sectors) {
      sectors = await fetchFidelity(isin);
      source = 'fidelity';
    }

    if (!sectors) continue;

    await upsertEtfSector(db, {
      isin,
      ticker: current?.ticker ?? '',
      isBond: false,
      sectors,
      source,
      updatedAt: new Date().toISOString(),
    });
    updated++;
  }

  return c.json({ data: { updated }, error: null }, 200);
});
