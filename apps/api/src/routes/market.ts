import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse } from '@investpilot/core';
import {
  fetchUberPrice,
  fetchUsdEurRate,
  fetchTickerPrices,
  ISIN_TO_TICKER,
} from '../services/marketData.js';
import { getLatestSnapshot, getDeGiroEtfScores } from '@investpilot/db';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const marketRoutes = new Hono<{ Variables: AppVariables }>();

export interface LivePrices {
  uberUsdCents: number | null;
  fxRateUsdEur: number | null;
  etfPricesEurCents: Record<string, number>; // isin → price in EUR cents
  fetchedAt: string; // ISO 8601
}

/**
 * GET /api/market/prices
 * Fetch live Uber price, USD/EUR rate, and ETF prices for the user's portfolio.
 */
marketRoutes.get('/prices', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');

    // Get user's current portfolio ISINs
    const snapshot = await getLatestSnapshot(db, userId);
    const isins = snapshot ? snapshot.holdings.map((h) => h.isin) : [];

    // Fetch all prices in parallel
    const [uberCents, fxRate, etfPrices] = await Promise.all([
      fetchUberPrice(),
      fetchUsdEurRate(),
      fetchTickerPrices(isins),
    ]);

    const response: ApiResponse<LivePrices> = {
      data: {
        uberUsdCents: uberCents,
        fxRateUsdEur: fxRate,
        etfPricesEurCents: etfPrices,
        fetchedAt: new Date().toISOString(),
      },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Market data error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/market/etf-scores?isins=ISIN1,ISIN2,...
 * Returns DeGiro ETF scoring data (spread, volume, core selection) for the given ISINs.
 */
marketRoutes.get('/etf-scores', async (c) => {
  const raw = c.req.query('isins');
  if (!raw) {
    return c.json({ data: [], error: null }, 200);
  }
  const isins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const db = getDbClient();
    const scores = await getDeGiroEtfScores(db, isins);
    return c.json({ data: scores, error: null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * GET /api/market/ticker-map
 * Returns the ISIN → Yahoo Finance ticker mapping (useful for debugging).
 */
marketRoutes.get('/ticker-map', (c) => {
  const raw: unknown = c.req.query('isins');
  const parsed = z.string().optional().safeParse(raw);
  if (!parsed.success || !parsed.data) {
    return c.json({ data: ISIN_TO_TICKER, error: null }, 200);
  }
  const requestedIsins = parsed.data.split(',').map((s) => s.trim());
  const filtered = Object.fromEntries(
    Object.entries(ISIN_TO_TICKER).filter(([isin]) => requestedIsins.includes(isin)),
  );
  return c.json({ data: filtered, error: null }, 200);
});
