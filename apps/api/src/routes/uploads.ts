import { Hono } from 'hono';
import type { ApiResponse } from '@investpilot/core';

export const uploadsRoutes = new Hono();

/**
 * POST /api/uploads/screenshot
 * Upload a portfolio screenshot for Claude to parse.
 * Returns structured data for user confirmation before saving.
 * Phase 4 implementation.
 */
uploadsRoutes.post('/screenshot', async (c) => {
  // TODO Phase 4:
  //   1. Accept multipart/form-data with image file
  //   2. Store raw image (local or object storage)
  //   3. Send to Claude vision API via packages/ai
  //   4. Return parsed holdings for user confirmation
  //   5. Confirmed data saved via POST /api/portfolio/snapshots
  const response: ApiResponse<null> = {
    data: null,
    error: 'Phase 4 not yet implemented',
  };
  return c.json(response, 501);
});
