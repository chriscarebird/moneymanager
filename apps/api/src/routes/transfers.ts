import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse, PendingTransfer } from '@investpilot/core';
import { getPendingTransfers, insertTransfer, updateTransferStatus } from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const transfersRoutes = new Hono<{ Variables: AppVariables }>();

const CreateTransferSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
  amountUsdCents: z.number().int().positive().nullable().optional(),
  amountEurCents: z.number().int().positive().nullable().optional(),
  fxRate: z.number().positive().nullable().optional(),
  dateInitiated: z.string().datetime().optional(),
});

/**
 * GET /api/transfers
 * List all pending and completed transfers for the current user.
 */
transfersRoutes.get('/', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const transfers = await getPendingTransfers(db, userId);
    const response: ApiResponse<PendingTransfer[]> = { data: transfers, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/transfers
 * Initiate a new pending transfer (e.g. Morgan Stanley → DeGiro).
 */
transfersRoutes.post('/', async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = CreateTransferSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.message }, 400);
  }

  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const transferId = await insertTransfer(db, userId, {
      source: parsed.data.source,
      destination: parsed.data.destination,
      amountUsdCents: parsed.data.amountUsdCents ?? null,
      amountEurCents: parsed.data.amountEurCents ?? null,
      fxRate: parsed.data.fxRate ?? null,
      dateInitiated: parsed.data.dateInitiated ?? new Date().toISOString(),
    });
    const response: ApiResponse<{ id: string }> = { data: { id: transferId }, error: null };
    return c.json(response, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * PATCH /api/transfers/:id
 * Update transfer status (pending → completed).
 */
transfersRoutes.patch('/:id', async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = z.object({ status: z.enum(['pending', 'completed']) }).safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: 'status must be "pending" or "completed"' }, 400);
  }

  try {
    const db = getDbClient();
    await updateTransferStatus(db, c.req.param('id'), parsed.data.status);
    const response: ApiResponse<null> = { data: null, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
