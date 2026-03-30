import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse, TargetAllocation } from '@investpilot/core';
import {
  getTargetAllocations,
  upsertTargetAllocation,
  deleteTargetAllocation,
  getCashBalance,
  setCashBalance,
} from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const settingsRoutes = new Hono<{ Variables: AppVariables }>();

const AllocationSchema = z.object({
  id: z.string().optional(),
  assetClass: z.string().min(1),
  etfIsin: z.string().min(1),
  etfName: z.string().min(1),
  targetPct: z.number().min(0).max(100),
  exchange: z.string().default('XETRA'),
  isFreeEtf: z.boolean().default(false),
  active: z.boolean().default(true),
});

/**
 * GET /api/settings/targets
 */
settingsRoutes.get('/targets', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const allocations = await getTargetAllocations(db, userId);
    const response: ApiResponse<TargetAllocation[]> = { data: allocations, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/settings/targets
 */
settingsRoutes.post('/targets', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = AllocationSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.message }, 400);
  }
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const { id: inputId, ...rest } = parsed.data;
    const id = await upsertTargetAllocation(
      db,
      userId,
      inputId !== undefined ? { id: inputId, ...rest } : rest,
    );
    const response: ApiResponse<{ id: string }> = { data: { id }, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * DELETE /api/settings/targets/:id
 */
settingsRoutes.delete('/targets/:id', async (c) => {
  try {
    const db = getDbClient();
    await deleteTargetAllocation(db, c.req.param('id'));
    const response: ApiResponse<null> = { data: null, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/settings/cash
 */
settingsRoutes.get('/cash', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const cash = await getCashBalance(db, userId);
    const response: ApiResponse<typeof cash> = { data: cash, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * PUT /api/settings/cash
 */
settingsRoutes.put('/cash', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = z.object({ amountCents: z.number().int().nonnegative() }).safeParse(raw);
  if (!parsed.success) {
    return c.json({ data: null, error: parsed.error.message }, 400);
  }
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    await setCashBalance(db, userId, parsed.data.amountCents);
    const response: ApiResponse<null> = { data: null, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
