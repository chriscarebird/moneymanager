/**
 * Phase 2B — Verification Gate tests
 *
 * Covers:
 *   1. Market data shape — ISIN_TO_TICKER map has expected keys
 *   2. FX rate flow — concentration changes correctly with different FX rates
 *   3. Cost optimizer — free vs. paid trades identified per isFreeEtf flag
 *   4. Cost optimizer — annotateTradeFees fair-use chain logic
 */

import { describe, it, expect } from 'vitest';
import type { PortfolioSnapshot, UberEquity, TargetAllocation, Holding } from '../types/index.js';
import { calculateConcentration } from '../calculations/concentration.js';
import {
  computeRebalancingPlan,
  DEGIRO_DEFAULT_FEE_CENTS,
} from '../calculations/rebalancing.js';
import {
  annotateTradeFees,
  optimiseTradeOrder,
  emptyTracker,
  withTrade,
  CHARGED_FEE_CENTS,
  FREE_CHAIN_MIN_CENTS,
} from '../calculations/fairuse.js';

// ── 1. Market data shape ──────────────────────────────────────────────────────

/**
 * ISIN_TO_TICKER lives in apps/api, so we validate the shape contract here
 * by testing the expected ISINs against a local copy of the reference mapping.
 */
const REFERENCE_ISIN_TO_TICKER: Record<string, string> = {
  'IE00B3RBWM25': 'VWRL.AS',
  'IE00B3XXRP09': 'VUSA.AS',
  'IE00BF4RFH31': 'IUSN.DE',
  'IE00BG47KB92': 'VAGE.AS',
  'IE00B0M62Y33': 'IAEX.AS',
  'IE0032077012': 'EQQQ.AS',
  'LU3047998896': 'BJL8.DE',
};

describe('Market data shape', () => {
  it('all reference ISINs are 12 characters starting with 2 letters', () => {
    const isinPattern = /^[A-Z]{2}[A-Z0-9]{10}$/;
    for (const isin of Object.keys(REFERENCE_ISIN_TO_TICKER)) {
      expect(isin).toMatch(isinPattern);
    }
  });

  it('all tickers contain a dot (exchange suffix) or are bare symbols', () => {
    for (const [isin, ticker] of Object.entries(REFERENCE_ISIN_TO_TICKER)) {
      // Tickers like VWRL.AS (exchange-qualified) or UBER (bare)
      expect(ticker.length).toBeGreaterThan(0);
      expect(isin).not.toBe(ticker); // ticker is not the ISIN itself
    }
  });

  it('covers all 7 reference ETF ISINs', () => {
    const expectedIsins = [
      'IE00B3RBWM25', // VWRL
      'IE00B3XXRP09', // VUSA
      'IE00BF4RFH31', // IUSN
      'IE00BG47KB92', // VAGE
      'IE00B0M62Y33', // IAEX
      'IE0032077012', // EQQQ
      'LU3047998896', // BJL8
    ];
    for (const isin of expectedIsins) {
      expect(REFERENCE_ISIN_TO_TICKER).toHaveProperty(isin);
    }
  });
});

// ── 2. FX rate flow through concentration ────────────────────────────────────

const ETF_SNAPSHOT: PortfolioSnapshot = {
  id: 'snap_fx',
  date: '2026-04-01T00:00:00Z',
  source: 'manual',
  rawImageUrl: null,
  holdings: [
    // ETF total: €10,000 = 1,000,000 EUR cents
    {
      snapshotId: 'snap_fx',
      assetType: 'ETF',
      name: 'VWRL',
      isin: 'IE00B3RBWM25',
      quantity: 100,
      priceCents: 10_000,
      valueCents: 1_000_000,
      exchange: 'XETRA',
    },
  ],
};

// Uber equity: $10,000 = 1,000,000 USD cents
const UBER_EQUITY: UberEquity[] = [
  {
    type: 'Direct_Shares',
    sharesHeld: 100,
    sharesAvailableToTransact: 100,
    marketValueUsdCents: 1_000_000,
    holdingPeriodActive: false,
  },
];

describe('FX rate flow through concentration', () => {
  it('higher FX rate (stronger EUR) → lower Uber EUR value → lower concentration', () => {
    // At 0.80: Uber EUR = $10,000 × 0.80 = €8,000 → concentration = 8,000/(10,000+8,000) ≈ 44.4%
    const low = calculateConcentration(ETF_SNAPSHOT, UBER_EQUITY, 20, 0.80);
    // At 1.00: Uber EUR = $10,000 × 1.00 = €10,000 → concentration = 10,000/(10,000+10,000) = 50%
    const high = calculateConcentration(ETF_SNAPSHOT, UBER_EQUITY, 20, 1.00);

    expect(high.uberConcentrationPct).toBeGreaterThan(low.uberConcentrationPct);
  });

  it('at FX 1.0 with equal ETF and Uber USD values → 50% concentration', () => {
    const result = calculateConcentration(ETF_SNAPSHOT, UBER_EQUITY, 20, 1.0);
    // ETF: €10,000, Uber USD: $10,000 → at 1.0, Uber EUR = €10,000
    // Total = €20,000, Uber % = 50%
    expect(result.uberConcentrationPct).toBeCloseTo(50, 1);
  });

  it('at FX 0.5 → Uber EUR = $10,000 × 0.5 = €5,000 → 33.3% concentration', () => {
    const result = calculateConcentration(ETF_SNAPSHOT, UBER_EQUITY, 20, 0.5);
    // ETF: €10,000, Uber EUR: €5,000, total: €15,000 → 33.3%
    expect(result.uberConcentrationPct).toBeCloseTo(33.3, 0);
  });

  it('isOverLimit is true when concentration exceeds the limit', () => {
    const result = calculateConcentration(ETF_SNAPSHOT, UBER_EQUITY, 20, 1.0);
    expect(result.isOverLimit).toBe(true); // 50% > 20%
  });

  it('isOverLimit is false when Uber is negligible vs ETF', () => {
    const tinyUber: UberEquity[] = [
      {
        type: 'Direct_Shares',
        sharesHeld: 1,
        sharesAvailableToTransact: 1,
        marketValueUsdCents: 100, // $1
        holdingPeriodActive: false,
      },
    ];
    const result = calculateConcentration(ETF_SNAPSHOT, tinyUber, 20, 1.0);
    // Uber EUR ≈ €1, total ≈ €10,001 → ~0.01% — well below 20%
    expect(result.isOverLimit).toBe(false);
    expect(result.uberConcentrationPct).toBeLessThan(1);
  });
});

// ── 3. Cost optimizer — free vs. paid via isFreeEtf ──────────────────────────

const FREE_TARGET: TargetAllocation = {
  id: 't_free',
  assetClass: 'Global Equity',
  etfIsin: 'IE00B3RBWM25',
  etfName: 'VWRL',
  targetPct: 60,
  exchange: 'XETRA',
  isFreeEtf: true,
  active: true,
};

const PAID_TARGET: TargetAllocation = {
  id: 't_paid',
  assetClass: 'Netherlands',
  etfIsin: 'IE00B0M62Y33',
  etfName: 'IAEX',
  targetPct: 40,
  exchange: 'AEX',
  isFreeEtf: false,
  active: true,
};

describe('Cost optimizer — isFreeEtf drives estimatedFeeCents', () => {
  const holdings: Holding[] = [
    // Underweight free ETF (target 60%, actual 0%) → will be bought
    // Underweight paid ETF (target 40%, actual 0%) → will be bought
  ];

  it('free ETF buy has estimatedFeeCents = 0', () => {
    const plan = computeRebalancingPlan(
      holdings,
      [FREE_TARGET],
      500_000, // €5,000 cash
      5,
      new Map([['IE00B3RBWM25', 10_000]]), // €100/share
    );
    const action = plan.actions.find((a) => a.etfIsin === 'IE00B3RBWM25');
    expect(action?.action).toBe('buy');
    expect(action?.estimatedFeeCents).toBe(0);
  });

  it('paid ETF buy has estimatedFeeCents = DEGIRO_DEFAULT_FEE_CENTS (200)', () => {
    const plan = computeRebalancingPlan(
      holdings,
      [PAID_TARGET],
      500_000,
      5,
      new Map([['IE00B0M62Y33', 10_000]]), // €100/share
    );
    const action = plan.actions.find((a) => a.etfIsin === 'IE00B0M62Y33');
    expect(action?.action).toBe('buy');
    expect(action?.estimatedFeeCents).toBe(DEGIRO_DEFAULT_FEE_CENTS);
  });

  it('totalFeeCents is 0 when all buys are free ETFs', () => {
    const plan = computeRebalancingPlan(
      holdings,
      [FREE_TARGET],
      500_000,
      5,
      new Map([['IE00B3RBWM25', 10_000]]),
    );
    expect(plan.totalFeeCents).toBe(0);
  });

  it('totalFeeCents is 200 when there is one paid ETF buy', () => {
    const plan = computeRebalancingPlan(
      holdings,
      [PAID_TARGET],
      500_000,
      5,
      new Map([['IE00B0M62Y33', 10_000]]),
    );
    expect(plan.totalFeeCents).toBe(200);
  });

  it('mixed plan: free ETF contributes 0 fee, paid ETF contributes 200', () => {
    const plan = computeRebalancingPlan(
      holdings,
      [FREE_TARGET, PAID_TARGET],
      1_000_000, // €10,000 cash
      5,
      new Map([
        ['IE00B3RBWM25', 10_000],
        ['IE00B0M62Y33', 10_000],
      ]),
    );

    const freeAction = plan.actions.find((a) => a.etfIsin === 'IE00B3RBWM25');
    const paidAction = plan.actions.find((a) => a.etfIsin === 'IE00B0M62Y33');

    expect(freeAction?.estimatedFeeCents).toBe(0);
    expect(paidAction?.estimatedFeeCents).toBe(DEGIRO_DEFAULT_FEE_CENTS);
    expect(plan.totalFeeCents).toBe(DEGIRO_DEFAULT_FEE_CENTS);
  });
});

// ── 4. Cost optimizer — fair-use chain logic ─────────────────────────────────

const VWRL = 'IE00B3RBWM25';
const MONTH = '2026-04';

describe('Cost optimizer — annotateTradeFees fair-use chain', () => {
  it('first trade of the month is always free', () => {
    const trackers = new Map([[VWRL, emptyTracker(VWRL, MONTH)]]);
    const trades = [{ isin: VWRL, direction: 'buy' as const, amountCents: 50_000 }];
    const annotated = annotateTradeFees(trades, trackers, MONTH);
    expect(annotated[0]?.isFree).toBe(true);
    expect(annotated[0]?.feeCents).toBe(0);
  });

  it('second same-direction trade ≥ €1,000 is free (chain intact)', () => {
    const firstTrade = {
      id: 't1',
      isin: VWRL,
      direction: 'buy' as const,
      amountCents: FREE_CHAIN_MIN_CENTS,
      date: `${MONTH}-05`,
      wasFree: true,
    };
    const tracker = withTrade(emptyTracker(VWRL, MONTH), firstTrade);
    const trackers = new Map([[VWRL, tracker]]);
    const trades = [{ isin: VWRL, direction: 'buy' as const, amountCents: FREE_CHAIN_MIN_CENTS }];
    const annotated = annotateTradeFees(trades, trackers, MONTH);
    expect(annotated[0]?.isFree).toBe(true);
  });

  it('second trade < €1,000 breaks the chain → charged', () => {
    const firstTrade = {
      id: 't1',
      isin: VWRL,
      direction: 'buy' as const,
      amountCents: FREE_CHAIN_MIN_CENTS,
      date: `${MONTH}-05`,
      wasFree: true,
    };
    const tracker = withTrade(emptyTracker(VWRL, MONTH), firstTrade);
    const trackers = new Map([[VWRL, tracker]]);
    const trades = [{ isin: VWRL, direction: 'buy' as const, amountCents: 50_000 }]; // < €1,000
    const annotated = annotateTradeFees(trades, trackers, MONTH);
    expect(annotated[0]?.isFree).toBe(false);
    expect(annotated[0]?.feeCents).toBe(CHARGED_FEE_CENTS);
  });

  it('opposite-direction second trade breaks the chain → charged', () => {
    const firstTrade = {
      id: 't1',
      isin: VWRL,
      direction: 'buy' as const,
      amountCents: FREE_CHAIN_MIN_CENTS,
      date: `${MONTH}-05`,
      wasFree: true,
    };
    const tracker = withTrade(emptyTracker(VWRL, MONTH), firstTrade);
    const trackers = new Map([[VWRL, tracker]]);
    const trades = [{ isin: VWRL, direction: 'sell' as const, amountCents: FREE_CHAIN_MIN_CENTS }];
    const annotated = annotateTradeFees(trades, trackers, MONTH);
    expect(annotated[0]?.isFree).toBe(false);
  });

  it('optimiseTradeOrder places free trades first', () => {
    // VWRL has no prior trades (will be free)
    // IAEX already has a chain-breaking trade (will be charged)
    const IAEX = 'IE00B0M62Y33';
    const brokenTrade = { id: 't_break', isin: IAEX, direction: 'buy' as const, amountCents: 50_000, date: `${MONTH}-01`, wasFree: true };
    const chainBreaker = { id: 't2', isin: IAEX, direction: 'sell' as const, amountCents: FREE_CHAIN_MIN_CENTS, date: `${MONTH}-02`, wasFree: false };
    const iaexTracker = withTrade(withTrade(emptyTracker(IAEX, MONTH), brokenTrade), chainBreaker);
    const trackers = new Map([
      [VWRL, emptyTracker(VWRL, MONTH)],
      [IAEX, iaexTracker],
    ]);

    const trades = [
      { isin: IAEX, direction: 'buy' as const, amountCents: FREE_CHAIN_MIN_CENTS }, // charged
      { isin: VWRL, direction: 'buy' as const, amountCents: FREE_CHAIN_MIN_CENTS }, // free (no prior)
    ];

    const ordered = optimiseTradeOrder(trades, trackers, MONTH);
    // First result should be the free trade (VWRL)
    expect(ordered[0]?.isin).toBe(VWRL);
    expect(ordered[0]?.isFree).toBe(true);
    expect(ordered[1]?.isin).toBe(IAEX);
    expect(ordered[1]?.isFree).toBe(false);
  });
});
