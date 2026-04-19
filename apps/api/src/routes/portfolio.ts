import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type {
  ApiResponse,
  PortfolioSnapshot,
  UberEquity,
  UberRSUGrant,
  TransactionHistory,
  MSSnapshotHistoryPoint,
  VestingEventRow,
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
  insertMSSnapshot,
  getMSSnapshotHistory,
  generateAndInsertVestingEvents,
  getVestingEvents,
  updateVestingEvent,
} from '@investpilot/db';
import type { VestingEventPatch } from '@investpilot/db';
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

    // Aggregate multiple rows of the same type (e.g. two ESPP rows → one summed row).
    // The DB enforces uniqueness on (user_id, type), so we must collapse duplicates here.
    const aggregated = new Map<string, UberEquity>();
    for (const equity of parsed.data.equity) {
      const existing = aggregated.get(equity.type);
      if (existing) {
        aggregated.set(equity.type, {
          type: equity.type,
          sharesHeld: existing.sharesHeld + equity.sharesHeld,
          sharesAvailableToTransact: existing.sharesAvailableToTransact + equity.sharesAvailableToTransact,
          marketValueUsdCents: existing.marketValueUsdCents + equity.marketValueUsdCents,
          holdingPeriodActive: existing.holdingPeriodActive || equity.holdingPeriodActive,
        });
      } else {
        aggregated.set(equity.type, { ...equity });
      }
    }

    const errors: string[] = [];
    let saved = 0;
    for (const position of aggregated.values()) {
      try {
        await upsertUberEquity(db, userId, position);
        saved++;
      } catch (itemErr) {
        const msg = itemErr instanceof Error ? itemErr.message : 'Unknown error';
        errors.push(`${position.type}: ${msg}`);
      }
    }
    if (errors.length > 0) {
      const response: ApiResponse<{ saved: number }> = {
        data: { saved },
        error: `Saved ${saved}/${aggregated.size} positions. Failures: ${errors.join('; ')}`,
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
    // Auto-generate (or regenerate) vesting events from the grant formula
    await generateAndInsertVestingEvents(db, userId, grant);
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

// ── MS Equity Snapshot History ────────────────────────────────────────────────

const SaveMSSnapshotSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'snapshotDate must be YYYY-MM-DD'),
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

/**
 * POST /api/portfolio/ms-snapshots
 * Save a confirmed MS screenshot as an immutable snapshot (history) and
 * also update uber_equity with the aggregated current state.
 */
portfolioRoutes.post('/ms-snapshots', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = SaveMSSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');

    // Aggregate duplicate types before saving
    const aggregated = new Map<string, (typeof parsed.data.equity)[number]>();
    for (const item of parsed.data.equity) {
      const existing = aggregated.get(item.type);
      if (existing) {
        aggregated.set(item.type, {
          ...existing,
          sharesHeld: existing.sharesHeld + item.sharesHeld,
          sharesAvailableToTransact: existing.sharesAvailableToTransact + item.sharesAvailableToTransact,
          marketValueUsdCents: existing.marketValueUsdCents + item.marketValueUsdCents,
          holdingPeriodActive: existing.holdingPeriodActive || item.holdingPeriodActive,
        });
      } else {
        aggregated.set(item.type, { ...item });
      }
    }

    const items = Array.from(aggregated.values());

    // Save immutable snapshot
    const snapshotId = await insertMSSnapshot(db, userId, parsed.data.snapshotDate, items);

    // Update current-state table
    for (const item of items) {
      await upsertUberEquity(db, userId, item as UberEquity);
    }

    const response: ApiResponse<{ snapshotId: string; saved: number }> = {
      data: { snapshotId, saved: items.length },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/portfolio/ms-snapshots/history
 * Time-series of total MS equity value for the chart.
 */
portfolioRoutes.get('/ms-snapshots/history', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const history = await getMSSnapshotHistory(db, userId);
    const response: ApiResponse<MSSnapshotHistoryPoint[]> = { data: history, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

// ── RSU Vesting Events ────────────────────────────────────────────────────────

/**
 * GET /api/portfolio/rsu-grants/:grantId/vesting-events
 * List all vesting events for a specific grant.
 */
portfolioRoutes.get('/rsu-grants/:grantId/vesting-events', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const grantId = c.req.param('grantId');
    const events = await getVestingEvents(db, userId, grantId);
    const response: ApiResponse<VestingEventRow[]> = { data: events, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

const PatchVestingEventSchema = z.object({
  incomeTaxRate: z.number().min(0).max(1).optional(),
  priceUsdCents: z.number().int().nonnegative().nullable().optional(),
  actualSharesReceived: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['upcoming', 'vested', 'cancelled']).optional(),
  notes: z.string().nullable().optional(),
});

/**
 * PATCH /api/portfolio/rsu-grants/:grantId/vesting-events/:eventId
 * Update tax rate, actuals, or status for one vesting event.
 */
portfolioRoutes.patch('/rsu-grants/:grantId/vesting-events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = PatchVestingEventSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: `Invalid request: ${parsed.error.message}` }, 400);
  }
  try {
    const db = getDbClient();
    const patch: VestingEventPatch = parsed.data;
    await updateVestingEvent(db, eventId, patch);
    const response: ApiResponse<{ updated: true }> = { data: { updated: true }, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/portfolio/rsu-grants/:grantId/vesting-events/regenerate
 * Re-derive vesting events from the stored grant formula.
 * Preserves actuals on already-vested events.
 */
portfolioRoutes.post('/rsu-grants/:grantId/vesting-events/regenerate', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const grantId = c.req.param('grantId');
    const grants = await getRSUGrants(db, userId);
    const grant = grants.find((g) => g.grantId === grantId);
    if (!grant) {
      return c.json({ data: null, error: `Grant ${grantId} not found` }, 404);
    }
    await generateAndInsertVestingEvents(db, userId, grant);
    const events = await getVestingEvents(db, userId, grantId);
    const response: ApiResponse<VestingEventRow[]> = { data: events, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
