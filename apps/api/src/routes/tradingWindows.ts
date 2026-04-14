import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse } from '@investpilot/core';
import {
  getTradingWindows,
  getNextTradingWindow,
  upsertTradingWindow,
  updateTradingWindowState,
  insertTransfer,
  type TradingWindow,
  type TradingWindowState,
} from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const tradingWindowsRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/trading-windows
 * List all trading windows for the current user (most recent first).
 */
tradingWindowsRoutes.get('/', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const windows = await getTradingWindows(db, userId);
    const response: ApiResponse<TradingWindow[]> = { data: windows, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/trading-windows/next
 * Return the next upcoming (non-complete) trading window.
 */
tradingWindowsRoutes.get('/next', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const window = await getNextTradingWindow(db, userId);
    const response: ApiResponse<TradingWindow | null> = { data: window, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/trading-windows
 * Create or update a trading window date for a given quarter.
 */
tradingWindowsRoutes.post('/', async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      quarter: z.string().regex(/^\d{4}-Q[1-4]$/, 'quarter must be YYYY-Q[1-4]'),
      openDate: z.string().datetime(),
      closeDate: z.string().datetime().optional(),
    })
    .safeParse(raw);

  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.message }, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const id = await upsertTradingWindow(db, userId, {
      quarter: parsed.data.quarter,
      openDate: parsed.data.openDate,
      closeDate: parsed.data.closeDate ?? null,
    });
    const response: ApiResponse<{ id: string }> = { data: { id }, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

const VALID_STATES: TradingWindowState[] = [
  'scheduled',
  'open',
  'advice_ready',
  'sold',
  'transfer_pending',
  'transfer_arrived',
  'complete',
];

/**
 * PATCH /api/trading-windows/:id/state
 * Advance the workflow state of a trading window.
 * When transitioning to 'transfer_pending', creates a pending_transfer record.
 */
tradingWindowsRoutes.patch('/:id/state', async (c) => {
  const windowId = c.req.param('id');
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      state: z.enum(VALID_STATES as [TradingWindowState, ...TradingWindowState[]]),
      adviceJson: z.string().optional(),
      sharesSold: z.number().int().nonnegative().optional(),
      proceedsUsdCents: z.number().int().nonnegative().optional(),
      // For creating a transfer when moving to transfer_pending
      transferAmountUsdCents: z.number().int().positive().optional(),
      transferAmountEurCents: z.number().int().positive().optional(),
      fxRate: z.number().positive().optional(),
    })
    .safeParse(raw);

  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.message }, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const data = parsed.data;

    let transferId: string | undefined;

    // When moving to transfer_pending, auto-create a PendingTransfer record
    if (data.state === 'transfer_pending' && data.transferAmountUsdCents) {
      transferId = await insertTransfer(db, userId, {
        source: 'Morgan Stanley',
        destination: 'DeGiro',
        amountUsdCents: data.transferAmountUsdCents,
        amountEurCents: data.transferAmountEurCents ?? null,
        fxRate: data.fxRate ?? null,
        dateInitiated: new Date().toISOString(),
      });
    }

    const extra: {
      adviceJson?: string;
      sharesSold?: number;
      proceedsUsdCents?: number;
      transferId?: string;
    } = {};
    if (data.adviceJson !== undefined) extra.adviceJson = data.adviceJson;
    if (data.sharesSold !== undefined) extra.sharesSold = data.sharesSold;
    if (data.proceedsUsdCents !== undefined) extra.proceedsUsdCents = data.proceedsUsdCents;
    if (transferId !== undefined) extra.transferId = transferId;
    await updateTradingWindowState(db, windowId, data.state, extra);

    const response: ApiResponse<{ transferId: string | null }> = {
      data: { transferId: transferId ?? null },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
