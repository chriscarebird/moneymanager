import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type {
  ApiResponse,
  PortfolioSnapshot,
  UberEquity,
  UberRSUGrant,
  TransactionHistory,
} from '@investpilot/core';
import {
  getSnapshots,
  getSnapshotWithHoldings,
  getLatestSnapshot,
  insertSnapshot,
  getSnapshotValueHistory,
  getTransactionHistory,
  insertTransaction,
  getUberEquity,
  getRSUGrants,
  upsertUberEquity,
  upsertRSUGrant,
} from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const portfolioRoutes = new Hono<{ Variables: AppVariables }>();

// ── Snapshot save schema (confirmed from parser output) ───────────────────────

const SaveSnapshotSchema = z.object({
  date: z.string(),
  source: z.enum(['screenshot', 'manual']),
  rawImageUrl: z.string().nullable().optional(),
  holdings: z.array(
    z.object({
      assetType: z.enum(['ETF', 'Stock']),
      name: z.string().min(1),
      isin: z.string(),
      quantity: z.number().int().positive(),
      priceCents: z.number().int().nonnegative(),
      valueCents: z.number().int().nonnegative(),
      exchange: z.string().default(''),
    }),
  ),
});

const SaveUberEquitySchema = z.object({
  equity: z.array(
    z.object({
      type: z.enum(['RSU', 'ESPP', 'Direct_Shares']),
      sharesHeld: z.number().int().nonnegative(),
      sharesAvailableToTransact: z.number().int().nonnegative(),
      marketValueUsdCents: z.number().int().nonnegative(),
      holdingPeriodActive: z.boolean(),
    }),
  ),
});

const SaveTransactionSchema = z.object({
  date: z.string(),
  action: z.enum(['buy', 'sell']),
  asset: z.string().min(1),
  isin: z.string().default(''),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  feeCents: z.number().int().nonnegative().default(0),
  exchange: z.string().default(''),
});

const SaveRSUGrantSchema = z.object({
  grantId: z.string().min(1),
  totalRsus: z.number().int().positive(),
  vestingCommencementDate: z.string(),
  vestingFormula: z.string(),
  dateOfGrant: z.string(),
  sourceDocumentUrl: z.string().nullable().optional(),
  status: z.enum(['active', 'fully_vested', 'forfeited']).default('active'),
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/portfolio/snapshots
 * List all portfolio snapshots (most recent first).
 */
portfolioRoutes.get('/snapshots', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const snapshots = await getSnapshots(db, userId);
    const response: ApiResponse<typeof snapshots> = { data: snapshots, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * GET /api/portfolio/snapshots/latest
 * Get the most recent snapshot with holdings.
 */
portfolioRoutes.get('/snapshots/latest', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const snapshot = await getLatestSnapshot(db, userId);
    const response: ApiResponse<PortfolioSnapshot | null> = { data: snapshot, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/portfolio/snapshots/history
 * Returns (date, totalValueCents) pairs for the portfolio growth chart.
 * IMPORTANT: must be defined before /snapshots/:id to avoid route collision.
 */
portfolioRoutes.get('/snapshots/history', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const history = await getSnapshotValueHistory(db, userId);
    const response: ApiResponse<typeof history> = { data: history, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/portfolio/transactions
 * List transaction history (most recent first).
 */
portfolioRoutes.get('/transactions', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const txs = await getTransactionHistory(db, userId);
    const response: ApiResponse<TransactionHistory[]> = { data: txs, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/portfolio/transactions
 * Record a new buy/sell transaction.
 */
portfolioRoutes.post('/transactions', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = SaveTransactionSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const id = randomUUID();
    await insertTransaction(db, userId, id, {
      date: parsed.data.date,
      action: parsed.data.action,
      asset: parsed.data.asset,
      isin: parsed.data.isin,
      quantity: parsed.data.quantity,
      priceCents: parsed.data.priceCents,
      feeCents: parsed.data.feeCents,
      exchange: parsed.data.exchange,
    });
    const response: ApiResponse<{ id: string }> = { data: { id }, error: null };
    return c.json(response, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/portfolio/snapshots/:id
 * Get a specific snapshot with holdings.
 */
portfolioRoutes.get('/snapshots/:id', async (c) => {
  try {
    const db = getDbClient();
    const id = c.req.param('id');
    const snapshot = await getSnapshotWithHoldings(db, id);
    if (!snapshot) {
      const response: ApiResponse<null> = { data: null, error: `Snapshot ${id} not found` };
      return c.json(response, 404);
    }
    const response: ApiResponse<PortfolioSnapshot> = { data: snapshot, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * POST /api/portfolio/snapshots
 * Save a confirmed DeGiro snapshot to the database.
 */
portfolioRoutes.post('/snapshots', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = SaveSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const id = randomUUID();
    const snapshot: PortfolioSnapshot = {
      id,
      date: parsed.data.date,
      source: parsed.data.source,
      rawImageUrl: parsed.data.rawImageUrl ?? null,
      holdings: parsed.data.holdings.map((h) => ({ ...h, snapshotId: id })),
    };
    await insertSnapshot(db, snapshot, userId);
    const response: ApiResponse<{ id: string }> = { data: { id }, error: null };
    return c.json(response, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * POST /api/portfolio/uber
 * Save confirmed Morgan Stanley equity positions to the database.
 */
portfolioRoutes.post('/uber', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = SaveUberEquitySchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const errors: string[] = [];
    let saved = 0;
    for (const equity of parsed.data.equity) {
      const position: UberEquity = {
        type: equity.type,
        sharesHeld: equity.sharesHeld,
        sharesAvailableToTransact: equity.sharesAvailableToTransact,
        marketValueUsdCents: equity.marketValueUsdCents,
        holdingPeriodActive: equity.holdingPeriodActive,
      };
      try {
        await upsertUberEquity(db, userId, position);
        saved++;
      } catch (itemErr) {
        const msg = itemErr instanceof Error ? itemErr.message : 'Unknown error';
        errors.push(`${equity.type}: ${msg}`);
      }
    }
    if (errors.length > 0) {
      const response: ApiResponse<{ saved: number }> = {
        data: { saved },
        error: `Saved ${saved}/${parsed.data.equity.length} positions. Failures: ${errors.join('; ')}`,
      };
      return c.json(response, 207);
    }
    const response: ApiResponse<{ saved: number }> = {
      data: { saved },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * POST /api/portfolio/rsu-grant
 * Save a confirmed RSU grant to the database.
 */
portfolioRoutes.post('/rsu-grant', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = SaveRSUGrantSchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const grant: UberRSUGrant = {
      grantId: parsed.data.grantId,
      totalRsus: parsed.data.totalRsus,
      vestingCommencementDate: parsed.data.vestingCommencementDate,
      vestingFormula: parsed.data.vestingFormula,
      dateOfGrant: parsed.data.dateOfGrant,
      sourceDocumentUrl: parsed.data.sourceDocumentUrl ?? null,
      status: parsed.data.status,
    };
    await upsertRSUGrant(db, userId, grant);
    const response: ApiResponse<{ grantId: string }> = {
      data: { grantId: grant.grantId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * GET /api/portfolio/uber
 * Get all Uber equity positions.
 */
portfolioRoutes.get('/uber', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const equity = await getUberEquity(db, userId);
    const response: ApiResponse<UberEquity[]> = { data: equity, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/portfolio/rsu-grants
 * Get all active RSU grants.
 */
portfolioRoutes.get('/rsu-grants', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const grants = await getRSUGrants(db, userId);
    const response: ApiResponse<UberRSUGrant[]> = { data: grants, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
