import { Hono } from 'hono';
import type { ApiResponse } from '@investpilot/core';

export const portfolioRoutes = new Hono();

/**
 * GET /api/portfolio/snapshots
 * List all portfolio snapshots (most recent first).
 * Phase 2 implementation.
 */
portfolioRoutes.get('/snapshots', async (c) => {
  // TODO Phase 2: query db for snapshots
  const response: ApiResponse<[]> = {
    data: [],
    error: null,
    meta: { phase: '1A-placeholder' },
  };
  return c.json(response, 200);
});

/**
 * GET /api/portfolio/snapshots/:id
 * Get a specific snapshot with holdings.
 * Phase 2 implementation.
 */
portfolioRoutes.get('/snapshots/:id', async (c) => {
  const id = c.req.param('id');
  // TODO Phase 2: query db
  const response: ApiResponse<null> = {
    data: null,
    error: `Snapshot ${id} — Phase 2 not yet implemented`,
  };
  return c.json(response, 501);
});

/**
 * POST /api/portfolio/snapshots
 * Create a new portfolio snapshot (manual or from parsed screenshot).
 * Phase 2 implementation.
 */
portfolioRoutes.post('/snapshots', async (c) => {
  // TODO Phase 2: validate body, save snapshot + holdings
  const response: ApiResponse<null> = {
    data: null,
    error: 'Phase 2 not yet implemented',
  };
  return c.json(response, 501);
});
