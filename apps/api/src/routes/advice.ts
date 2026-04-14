import { Hono } from 'hono';
import { z } from 'zod';
import { streamText } from 'hono/streaming';
import type { ApiResponse } from '@investpilot/core';
import {
  generateRebalancingAdvice,
  generateRSUAdvice,
  generateDCAAdvice,
  generateStrategyAdvice,
  generateUberSellAdvice,
  streamAdvisoryChat,
  type AdviceResponse,
  type StrategyAdvice,
  type UberSellAdvice,
} from '@investpilot/ai';
import {
  getLatestSnapshot,
  getUberEquity,
  getRSUGrants,
  getTargetAllocations,
  getCashBalance,
  getAdviceLog,
  insertAdviceLog,
  markAdviceLogFollowed,
} from '@investpilot/db';
import { computeRebalancingPlan, computeVestingSchedule, calculateConcentration, stackVestingSchedules } from '@investpilot/core';
import { getDbClient } from '../db.js';
import type { AppVariables } from '../types.js';

export const adviceRoutes = new Hono<{ Variables: AppVariables }>();

const DEFAULT_FX_RATE = 0.92;

/** Helper: load all portfolio context needed by advisors */
async function loadPortfolioContext(userId: string) {
  const db = getDbClient();
  const [snapshot, equity, grants, targets, cashBalance] = await Promise.all([
    getLatestSnapshot(db, userId),
    getUberEquity(db, userId),
    getRSUGrants(db, userId),
    getTargetAllocations(db, userId),
    getCashBalance(db, userId),
  ]);
  return { snapshot, equity, grants, targets, cashBalance };
}

/**
 * POST /api/advice/rebalance
 * Generate rebalancing commentary for the current portfolio.
 */
adviceRoutes.post('/rebalance', async (c) => {
  try {
    const userId = c.get('userId');
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = z.object({ cashCents: z.number().int().nonnegative().optional() }).safeParse(raw);
    const cashOverride = parsed.success ? (parsed.data.cashCents ?? undefined) : undefined;

    const { snapshot, targets, cashBalance } = await loadPortfolioContext(userId);
    if (!snapshot) {
      return c.json({ data: null, error: 'No portfolio snapshot found' }, 404);
    }

    const cashCents = cashOverride ?? cashBalance?.amountCents ?? 0;
    const plan = computeRebalancingPlan(snapshot.holdings, targets, cashCents, 5);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const freeIsins = targets.filter((t) => t.isFreeEtf && t.active).map((t) => t.etfIsin);

    const advice = await generateRebalancingAdvice({
      plan,
      currentMonth,
      availableFreeTradeIsins: freeIsins,
      cashBalanceEurCents: cashCents,
    });

    const db = getDbClient();
    const adviceId = await insertAdviceLog(db, userId, {
      type: 'rebalance',
      recommendationText: JSON.stringify(advice),
    });

    const response: ApiResponse<AdviceResponse & { adviceId: string }> = {
      data: { ...advice, adviceId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisory error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/advice/rsu
 * Generate RSU sell/hold advice.
 */
adviceRoutes.post('/rsu', async (c) => {
  try {
    const userId = c.get('userId');
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({ uberPriceUsdCents: z.number().int().positive().optional() })
      .safeParse(raw);
    const uberPrice = parsed.success
      ? (parsed.data.uberPriceUsdCents ?? 6900_00) // ~$69 fallback
      : 6900_00;

    const { snapshot, equity, grants } = await loadPortfolioContext(userId);
    if (!snapshot) {
      return c.json({ data: null, error: 'No portfolio snapshot found' }, 404);
    }

    const activeGrants = grants.filter((g) => g.status === 'active');
    const vestingSchedules = activeGrants.map((g) => computeVestingSchedule(g));
    const stackedEvents = stackVestingSchedules(vestingSchedules);
    const vestingSchedule = {
      grantId: 'composite',
      totalRsus: vestingSchedules.reduce((s, v) => s + v.totalRsus, 0),
      vestedToDate: vestingSchedules.reduce((s, v) => s + v.vestedToDate, 0),
      unvestedToDate: vestingSchedules.reduce((s, v) => s + v.unvestedToDate, 0),
      nextVestingDate: stackedEvents.find((e) => e.isFuture)?.date ?? null,
      nextVestingShares: stackedEvents.find((e) => e.isFuture)?.sharesVesting ?? 0,
      events: stackedEvents,
    };
    const concentration = calculateConcentration(snapshot, equity, 20, DEFAULT_FX_RATE);
    const availableShares = equity.reduce((s, e) => s + e.sharesAvailableToTransact, 0);

    const advice = await generateRSUAdvice({
      vestingSchedule,
      concentration,
      sharesAvailableToSell: availableShares,
      currentUsdPriceCents: uberPrice,
    });

    const db = getDbClient();
    const adviceId = await insertAdviceLog(db, userId, {
      type: 'RSU',
      recommendationText: JSON.stringify(advice),
      pricesJson: JSON.stringify({ uberPriceUsdCents: uberPrice, fxRate: DEFAULT_FX_RATE }),
    });

    const response: ApiResponse<AdviceResponse & { adviceId: string }> = {
      data: { ...advice, adviceId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisory error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/advice/dca
 * Generate monthly DCA buy orders for a given investment amount.
 */
adviceRoutes.post('/dca', async (c) => {
  try {
    const userId = c.get('userId');
    const raw: unknown = await c.req.json();
    const parsed = z
      .object({ amountEurCents: z.number().int().positive() })
      .safeParse(raw);
    if (!parsed.success) {
      return c.json({ data: null, error: 'amountEurCents is required' }, 400);
    }

    const { snapshot, targets, cashBalance } = await loadPortfolioContext(userId);
    if (!snapshot) {
      return c.json({ data: null, error: 'No portfolio snapshot found' }, 404);
    }

    const cashCents = cashBalance?.amountCents ?? 0;
    const plan = computeRebalancingPlan(
      snapshot.holdings,
      targets,
      cashCents + parsed.data.amountEurCents,
      5,
    );
    const freeIsins = targets.filter((t) => t.isFreeEtf && t.active).map((t) => t.etfIsin);

    const advice = await generateDCAAdvice({
      investmentAmountEurCents: parsed.data.amountEurCents,
      currentMonth: new Date().toISOString().slice(0, 7),
      availableFreeTradeIsins: freeIsins,
      plan,
    });

    const db = getDbClient();
    const adviceId = await insertAdviceLog(db, userId, {
      type: 'DCA',
      recommendationText: JSON.stringify(advice),
    });

    const response: ApiResponse<AdviceResponse & { adviceId: string }> = {
      data: { ...advice, adviceId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisory error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/advice/strategy
 * Quarterly portfolio review — uses Opus + web search.
 */
adviceRoutes.post('/strategy', async (c) => {
  try {
    const userId = c.get('userId');
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({ uberPriceUsdCents: z.number().int().positive().optional(), fxRate: z.number().optional() })
      .safeParse(raw);
    const uberPrice = parsed.success ? (parsed.data.uberPriceUsdCents ?? undefined) : undefined;
    const fxRate = (parsed.success ? parsed.data.fxRate : undefined) ?? DEFAULT_FX_RATE;

    const { snapshot, equity, grants, targets, cashBalance } = await loadPortfolioContext(userId);
    if (!snapshot) {
      return c.json({ data: null, error: 'No portfolio snapshot found' }, 404);
    }

    const cashCents = cashBalance?.amountCents ?? 0;
    const plan = computeRebalancingPlan(snapshot.holdings, targets, cashCents, 5);
    const activeGrants = grants.filter((g) => g.status === 'active');
    const schedules = activeGrants.map((g) => computeVestingSchedule(g));
    const stackedEvents = stackVestingSchedules(schedules);
    const vestingSchedule = {
      grantId: 'composite',
      totalRsus: schedules.reduce((s, v) => s + v.totalRsus, 0),
      vestedToDate: schedules.reduce((s, v) => s + v.vestedToDate, 0),
      unvestedToDate: schedules.reduce((s, v) => s + v.unvestedToDate, 0),
      nextVestingDate: stackedEvents.find((e) => e.isFuture)?.date ?? null,
      nextVestingShares: stackedEvents.find((e) => e.isFuture)?.sharesVesting ?? 0,
      events: stackedEvents,
    };
    const concentration = calculateConcentration(snapshot, equity, 20, fxRate);

    const advice = await generateStrategyAdvice({
      snapshot,
      uberEquity: equity,
      rsuGrants: grants,
      targets,
      cashBalance: cashBalance
        ? { id: 'cb', amountCents: cashBalance.amountCents, dateUpdated: cashBalance.dateUpdated, notes: null }
        : null,
      rebalancingPlan: plan,
      vestingSchedule,
      concentration,
      fxRate,
      ...(uberPrice !== undefined ? { uberPriceUsdCents: uberPrice } : {}),
    });

    const db = getDbClient();
    const adviceId = await insertAdviceLog(db, userId, {
      type: 'strategy',
      recommendationText: JSON.stringify(advice),
      pricesJson: JSON.stringify({ uberPriceUsdCents: uberPrice, fxRate }),
    });

    const response: ApiResponse<StrategyAdvice & { adviceId: string }> = {
      data: { ...advice, adviceId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisory error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/advice/uber-sell
 * Uber sell recommendation for trading window — uses Sonnet + web search.
 */
adviceRoutes.post('/uber-sell', async (c) => {
  try {
    const userId = c.get('userId');
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({
        uberPriceUsdCents: z.number().int().positive().optional(),
        fxRate: z.number().optional(),
      })
      .safeParse(raw);
    const uberPrice = (parsed.success ? parsed.data.uberPriceUsdCents : undefined) ?? 6900_00;
    const fxRate = (parsed.success ? parsed.data.fxRate : undefined) ?? DEFAULT_FX_RATE;

    const { snapshot, equity, grants } = await loadPortfolioContext(userId);
    if (!snapshot) {
      return c.json({ data: null, error: 'No portfolio snapshot found' }, 404);
    }

    const concentration = calculateConcentration(snapshot, equity, 20, fxRate);
    const today = new Date();
    const nearYearEnd =
      today.getMonth() === 11 && today.getDate() >= 19; // within ~6 weeks of Dec 31

    const advice = await generateUberSellAdvice({
      snapshot,
      uberEquity: equity,
      rsuGrants: grants,
      concentration,
      uberPriceUsdCents: uberPrice,
      fxRate,
      nearYearEnd,
    });

    const db = getDbClient();
    const adviceId = await insertAdviceLog(db, userId, {
      type: 'RSU',
      recommendationText: JSON.stringify(advice),
      pricesJson: JSON.stringify({ uberPriceUsdCents: uberPrice, fxRate }),
    });

    const response: ApiResponse<UberSellAdvice & { adviceId: string }> = {
      data: { ...advice, adviceId },
      error: null,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advisory error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * POST /api/advice/chat
 * Streaming advisory chat follow-ups. Returns SSE text/event-stream.
 */
adviceRoutes.post('/chat', async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
      contextSummary: z.string().default(''),
    })
    .safeParse(raw);

  if (!parsed.success) {
    return c.json({ data: null, error: 'Invalid chat payload' }, 400);
  }

  return streamText(c, async (stream) => {
    try {
      for await (const chunk of streamAdvisoryChat(
        parsed.data.messages,
        parsed.data.contextSummary,
      )) {
        await stream.write(chunk);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stream error';
      await stream.write(`\n\n[Error: ${msg}]`);
    }
  });
});

/**
 * GET /api/advice/log
 * Return history of advice generated.
 */
adviceRoutes.get('/log', async (c) => {
  try {
    const db = getDbClient();
    const userId = c.get('userId');
    const log = await getAdviceLog(db, userId);
    const response: ApiResponse<typeof log> = { data: log, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});

/**
 * PATCH /api/advice/log/:id/followed
 * Mark advice as followed or not.
 */
adviceRoutes.patch('/log/:id/followed', async (c) => {
  try {
    const raw: unknown = await c.req.json();
    const parsed = z.object({ wasFollowed: z.boolean() }).safeParse(raw);
    if (!parsed.success) {
      return c.json({ data: null, error: 'wasFollowed boolean required' }, 400);
    }
    const db = getDbClient();
    await markAdviceLogFollowed(db, c.req.param('id'), parsed.data.wasFollowed);
    const response: ApiResponse<null> = { data: null, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return c.json({ data: null, error: message }, 500);
  }
});
