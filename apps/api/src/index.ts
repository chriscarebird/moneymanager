import { serve, serveStatic } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requireAuth } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { adviceRoutes } from './routes/advice.js';
import { uploadsRoutes } from './routes/uploads.js';
import { settingsRoutes } from './routes/settings.js';
import { notificationsRoutes } from './routes/notifications.js';
import { transfersRoutes } from './routes/transfers.js';
import { tradingWindowsRoutes } from './routes/tradingWindows.js';
import { marketRoutes } from './routes/market.js';
import { exportRoutes } from './routes/export.js';
import { runSchedulerForAllUsers } from './services/notificationScheduler.js';
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

// VAPID public key is public (needed before login for PWA registration)
app.get('/api/notifications/vapid-public-key', (c) => {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  if (!publicKey) return c.json({ data: null, error: 'Push not configured' }, 503);
  return c.json({ data: { publicKey }, error: null }, 200);
});

// ── Protected routes (require valid session) ─────────────────────────────────

app.use('/api/portfolio/*', requireAuth);
app.use('/api/advice/*', requireAuth);
app.use('/api/uploads/*', requireAuth);
app.use('/api/settings/*', requireAuth);
app.use('/api/notifications/*', requireAuth);
app.use('/api/transfers/*', requireAuth);
app.use('/api/trading-windows/*', requireAuth);
app.use('/api/market/*', requireAuth);
app.use('/api/export/*', requireAuth);

app.route('/api/portfolio', portfolioRoutes);
app.route('/api/advice', adviceRoutes);
app.route('/api/uploads', uploadsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/transfers', transfersRoutes);
app.route('/api/trading-windows', tradingWindowsRoutes);
app.route('/api/market', marketRoutes);
app.route('/api/export', exportRoutes);

// ── Serve web SPA static files in production ─────────────────────────────────
// In Docker, apps/web/dist is copied alongside the API at ../web/dist

if (process.env['NODE_ENV'] === 'production') {
  app.use('/*', serveStatic({ root: '../web/dist' }));
  // SPA fallback: serve index.html for any non-asset path
  app.use('/*', serveStatic({ path: '../web/dist/index.html' }));
}

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
    // Run scheduler on startup (non-blocking)
    runSchedulerForAllUsers().catch((err: unknown) => {
      console.error('Startup scheduler error:', err);
    });
    // Re-run scheduler every 6 hours for drift/RSU/quarterly alerts
    setInterval(() => {
      runSchedulerForAllUsers().catch((err: unknown) => {
        console.error('Cron scheduler error:', err);
      });
    }, 6 * 60 * 60 * 1000);
  },
);

export { app };
