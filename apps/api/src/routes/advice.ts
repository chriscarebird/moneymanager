import { Hono } from 'hono';
import type { ApiResponse } from '@investpilot/core';

export const adviceRoutes = new Hono();

/**
 * POST /api/advice/rebalance
 * Generate rebalancing advice using Claude.
 * Phase 4 implementation.
 */
adviceRoutes.post('/rebalance', async (c) => {
  // TODO Phase 4: fetch latest snapshot, compute rebalancing, call Claude
  const response: ApiResponse<null> = {
    data: null,
    error: 'Phase 4 not yet implemented',
  };
  return c.json(response, 501);
});

/**
 * POST /api/advice/rsu
 * Generate RSU sell/hold advice based on vesting schedule and concentration.
 * Phase 4 implementation.
 */
adviceRoutes.post('/rsu', async (c) => {
  // TODO Phase 4: compute RSU vesting, check concentration, call Claude
  const response: ApiResponse<null> = {
    data: null,
    error: 'Phase 4 not yet implemented',
  };
  return c.json(response, 501);
});

/**
 * GET /api/advice/log
 * Return history of advice generated.
 * Phase 4 implementation.
 */
adviceRoutes.get('/log', async (c) => {
  // TODO Phase 4: query advice_log table
  const response: ApiResponse<[]> = {
    data: [],
    error: null,
    meta: { phase: '1A-placeholder' },
  };
  return c.json(response, 200);
});
