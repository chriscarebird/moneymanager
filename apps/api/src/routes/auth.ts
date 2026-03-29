import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  verifyCredentials,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '../middleware/auth.js';
import type { ApiResponse } from '@investpilot/core';

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const authRoutes = new Hono();

/**
 * POST /api/auth/login
 * Authenticate with username + password, set session cookie.
 */
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json');

  const user = await verifyCredentials(username, password);
  if (!user) {
    const response: ApiResponse<null> = {
      data: null,
      error: 'Invalid username or password',
    };
    return c.json(response, 401);
  }

  const token = await createSessionToken(user);
  setSessionCookie(c, token);

  const response: ApiResponse<{ id: string; name: string }> = {
    data: { id: user.id, name: user.name },
    error: null,
  };
  return c.json(response, 200);
});

/**
 * POST /api/auth/logout
 * Clear the session cookie.
 */
authRoutes.post('/logout', (c) => {
  clearSessionCookie(c);
  const response: ApiResponse<null> = { data: null, error: null };
  return c.json(response, 200);
});

/**
 * GET /api/auth/me
 * Return current session user (requires valid cookie).
 */
authRoutes.get('/me', async (c) => {
  const userId = c.get('userId') as string | undefined;
  const userName = c.get('userName') as string | undefined;

  if (!userId) {
    const response: ApiResponse<null> = { data: null, error: 'Not authenticated' };
    return c.json(response, 401);
  }

  const response: ApiResponse<{ id: string; name: string }> = {
    data: { id: userId, name: userName ?? userId },
    error: null,
  };
  return c.json(response, 200);
});
