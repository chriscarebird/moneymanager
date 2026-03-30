import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requireAuth } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { adviceRoutes } from './routes/advice.js';
import { uploadsRoutes } from './routes/uploads.js';
import { settingsRoutes } from './routes/settings.js';
import type { AppVariables } from './types.js';

const app = new Hono<{ Variables: AppVariables }>();

// ── Global middleware ────────────────────────────────────────────────────────

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Health check (public) ────────────────────────────────────────────────────

app.get('/api/health', (c) => {
  return c.json({
    data: {
      status: 'ok',
      service: 'investpilot-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});

// ── Auth routes (public) ─────────────────────────────────────────────────────

app.route('/api/auth', authRoutes);

// ── Protected routes (require valid session) ─────────────────────────────────

app.use('/api/portfolio/*', requireAuth);
app.use('/api/advice/*', requireAuth);
app.use('/api/uploads/*', requireAuth);
app.use('/api/settings/*', requireAuth);

app.route('/api/portfolio', portfolioRoutes);
app.route('/api/advice', adviceRoutes);
app.route('/api/uploads', uploadsRoutes);
app.route('/api/settings', settingsRoutes);

// ── 404 handler ──────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json({ data: null, error: `Route not found: ${c.req.path}` }, 404);
});

// ── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      data: null,
      error: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : err.message,
    },
    500,
  );
});

// ── Start server ─────────────────────────────────────────────────────────────

const port = parseInt(process.env['PORT'] ?? '3001', 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.warn(`InvestPilot API running on http://localhost:${info.port}`);
  },
);

export { app };
