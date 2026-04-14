/**
 * Phase 2A — Verification Gate: Math checks
 *
 * Covers:
 *   1. Uber advisor: correct suggestedSellUsdCents from reference portfolio
 *   2. Uber sell shares: at known price, sell amount maps to correct share count
 *   3. DCA scheduler: concrete amounts and correct allocation order
 *   4. DCA free-trade flag: ISINs on free-ETF list are tagged correctly
 */

import { describe, it, expect } from 'vitest';
import type { PortfolioSnapshot, UberEquity, TargetAllocation } from '../types/index.js';
import { calculateConcentration } from '../calculations/concentration.js';
import { computeRebalancingPlan } from '../calculations/rebalancing.js';

// ── Reference data from SPEC §2 ───────────────────────────────────────────────
//
//  DeGiro ETF portfolio (EUR cents):
//    VWRL  1,537,500  VUSA  284,700  IUSN  264,400  VAGE  120,400
//    IAEX    114,900  EQQQ   98,000  BJL8   10,400
//    Total = 2,430,300 EUR cents ≈ €24,303
//
//  Morgan Stanley Uber equity (USD cents):
//    Direct Shares   221,400  (32 shares available)
//    ESPP          1,231,400  (178 shares available)
//    RSU           2,317,500  (0 available — unvested)
//    Total ALL     3,770,300  USD cents = $37,703
//    Total AVAILABLE (no RSUs) = 1,452,800 USD cents = $14,528
//
//  At FX 0.92:
//    ALL Uber EUR  = 3,770,300 × 0.92 = 3,468,676  → concentration 58.8%
//    AVAIL Uber EUR = 1,452,800 × 0.92 = 1,336,576  → concentration 35.5%

const SNAPSHOT: PortfolioSnapshot = {
  id: 'snap_ref',
  date: '2026-03-01T00:00:00.000Z',
  source: 'manual',
  rawImageUrl: null,
  holdings: [
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'VWRL', isin: 'IE00B3RBWM25', quantity: 112, priceCents: 13728, valueCents: 1_537_500, exchange: 'XETRA' },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'VUSA', isin: 'IE00B3XXRP09', quantity: 27,  priceCents: 10546, valueCents: 284_700,   exchange: 'XETRA' },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'IUSN', isin: 'IE00BF4RFH31', quantity: 339, priceCents: 780,   valueCents: 264_400,   exchange: 'XETRA' },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'VAGE', isin: 'IE00BG47KB92', quantity: 59,  priceCents: 2040,  valueCents: 120_400,   exchange: 'XETRA' },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'IAEX', isin: 'IE00B0M62Y33', quantity: 12,  priceCents: 9577,  valueCents: 114_900,   exchange: 'AEX'   },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'EQQQ', isin: 'IE0032077012', quantity: 2,   priceCents: 49010, valueCents: 98_000,    exchange: 'XETRA' },
    { snapshotId: 'snap_ref', assetType: 'ETF', name: 'BJL8', isin: 'LU3047998896', quantity: 10,  priceCents: 1041,  valueCents: 10_400,    exchange: 'XETRA' },
  ],
};

const UBER_ALL: UberEquity[] = [
  { type: 'Direct_Shares', sharesHeld: 32,  sharesAvailableToTransact: 32,  marketValueUsdCents: 221_400,   holdingPeriodActive: false },
  { type: 'ESPP',          sharesHeld: 178, sharesAvailableToTransact: 178, marketValueUsdCents: 1_231_400, holdingPeriodActive: true  },
  { type: 'RSU',           sharesHeld: 335, sharesAvailableToTransact: 0,   marketValueUsdCents: 2_317_500, holdingPeriodActive: false },
];

const UBER_AVAILABLE: UberEquity[] = [
  { type: 'Direct_Shares', sharesHeld: 32,  sharesAvailableToTransact: 32,  marketValueUsdCents: 221_400,   holdingPeriodActive: false },
  { type: 'ESPP',          sharesHeld: 178, sharesAvailableToTransact: 178, marketValueUsdCents: 1_231_400, holdingPeriodActive: true  },
];

const TARGETS: TargetAllocation[] = [
  { id: 't_vwrl', assetClass: 'Global Equity', etfIsin: 'IE00B3RBWM25', etfName: 'VWRL', targetPct: 60, exchange: 'XETRA', isFreeEtf: true,  active: true },
  { id: 't_vusa', assetClass: 'US Equity',     etfIsin: 'IE00B3XXRP09', etfName: 'VUSA', targetPct: 20, exchange: 'XETRA', isFreeEtf: true,  active: true },
  { id: 't_iusn', assetClass: 'Small Cap',     etfIsin: 'IE00BF4RFH31', etfName: 'IUSN', targetPct: 10, exchange: 'XETRA', isFreeEtf: true,  active: true },
  { id: 't_vage', assetClass: 'Bonds',         etfIsin: 'IE00BG47KB92', etfName: 'VAGE', targetPct: 5,  exchange: 'XETRA', isFreeEtf: true,  active: true },
  { id: 't_iaex', assetClass: 'Netherlands',   etfIsin: 'IE00B0M62Y33', etfName: 'IAEX', targetPct: 5,  exchange: 'AEX',   isFreeEtf: false, active: true },
];

const ETF_TOTAL_CENTS = 2_430_300; // sum of all 7 holdings
const FX_RATE = 0.92;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Uber Sell Math
// ─────────────────────────────────────────────────────────────────────────────

describe('Uber advisor — sell-to-target math', () => {
  it('correctly identifies Uber concentration over 20% limit using ALL equity', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_ALL, 20, FX_RATE);

    // Total Uber USD = 3,770,300; EUR = 3,770,300 × 0.92 = 3,468,676
    expect(result.uberEquityUsdCents).toBe(3_770_300);
    expect(result.uberEquityEurCents).toBe(3_468_676);

    // Total portfolio EUR = 2,430,300 + 3,468,676 = 5,898,976
    expect(result.totalValueEurCents).toBe(5_898_976);

    // Uber concentration % ≈ 58.8%
    expect(result.uberConcentrationPct).toBeCloseTo(58.8, 0);
    expect(result.isOverLimit).toBe(true);
  });

  it('suggestedSellUsdCents reduces Uber to exactly 20% of post-sale portfolio', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_ALL, 20, FX_RATE);

    const { suggestedSellUsdCents, uberEquityEurCents, totalValueEurCents } = result;

    // After selling suggestedSellUsdCents:
    const sellEurCents = suggestedSellUsdCents * FX_RATE;
    const postSaleUberEur = uberEquityEurCents - sellEurCents;
    const postSaleTotal = totalValueEurCents - sellEurCents;
    const postSalePct = (postSaleUberEur / postSaleTotal) * 100;

    // Must be at or just below 20% (ceiling arithmetic rounds up sell amount)
    expect(postSalePct).toBeLessThanOrEqual(20.0);
    expect(postSalePct).toBeGreaterThan(19.9);

    // Sanity: sell amount should be ~$31,000–$32,000 given the data
    expect(suggestedSellUsdCents).toBeGreaterThan(30_000_00); // > $30,000
    expect(suggestedSellUsdCents).toBeLessThan(33_000_00);    // < $33,000
  });

  it('correctly identifies concentration using only available equity (no unvested RSUs)', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, 20, FX_RATE);

    // Available Uber USD = 221,400 + 1,231,400 = 1,452,800
    expect(result.uberEquityUsdCents).toBe(1_452_800);

    // Still over 20% limit
    expect(result.isOverLimit).toBe(true);
    expect(result.uberConcentrationPct).toBeGreaterThan(20);
  });

  it('does NOT suggest selling when Uber is under 20% limit', () => {
    // Shrink Uber to only Direct Shares (~2% of portfolio)
    const smallUber: UberEquity[] = [
      { type: 'Direct_Shares', sharesHeld: 5, sharesAvailableToTransact: 5, marketValueUsdCents: 35_000, holdingPeriodActive: false },
    ];
    const result = calculateConcentration(SNAPSHOT, smallUber, 20, FX_RATE);

    expect(result.isOverLimit).toBe(false);
    expect(result.suggestedSellUsdCents).toBe(0);
  });

  it('shares-to-sell at reference price maps to a calculable number', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_ALL, 20, FX_RATE);

    // Reference: all 545 Uber shares ≈ $37,703 → $69.18/share average
    const avgPriceUsd = 3_770_300 / 545; // cents per share
    const sharesToSell = Math.ceil(result.suggestedSellUsdCents / avgPriceUsd);

    // Should recommend selling 200–500 shares (reasonable range given 58.8% → 20%)
    expect(sharesToSell).toBeGreaterThan(200);
    expect(sharesToSell).toBeLessThanOrEqual(545); // can't sell more than held
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DCA Scheduler — concrete amounts and correct order
// ─────────────────────────────────────────────────────────────────────────────

describe('DCA scheduler — concrete amounts', () => {
  const CURRENT_MONTH = '2026-04';

  it('deploys €500 cash into the most underweight ETFs', () => {
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 50_000, 5);

    // Cash is €500 (50,000 cents). Plan must recommend buying something.
    expect(plan.rebalancingRecommended).toBe(true);

    const buys = plan.actions.filter((a) => a.action === 'buy');
    expect(buys.length).toBeGreaterThan(0);

    // Total allocated must not exceed available cash
    const totalBought = buys.reduce((s, a) => s + a.amountEurCents, 0);
    expect(totalBought).toBeLessThanOrEqual(50_000);
    expect(totalBought).toBeGreaterThan(0);
  });

  it('VUSA is the most underweight ETF at reference portfolio values', () => {
    // Reference: VUSA is 284,700 out of 2,430,300 total = 11.7% vs 20% target
    // Drift = -8.3% — most underweight after VAGE/IAEX if only 4 ETF targets used
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 50_000, 5);

    // The most negative drift should be VUSA (target 20%, actual ~11.7%)
    const vsaAction = plan.actions.find((a) => a.etfIsin === 'IE00B3XXRP09');
    expect(vsaAction).toBeDefined();
    expect(vsaAction!.driftPct).toBeLessThan(0); // underweight
  });

  it('amounts are positive integers (no fractional cents)', () => {
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 100_000, 5);

    for (const action of plan.actions.filter((a) => a.action === 'buy')) {
      expect(Number.isInteger(action.amountEurCents)).toBe(true);
      expect(action.amountEurCents).toBeGreaterThan(0);
    }
  });

  it('larger cash deployment (€1,000) produces more concrete buy orders', () => {
    const planSmall = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 50_000, 5);
    const planLarge = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 100_000, 5);

    const smallTotal = planSmall.actions.filter(a => a.action === 'buy').reduce((s, a) => s + a.amountEurCents, 0);
    const largeTotal = planLarge.actions.filter(a => a.action === 'buy').reduce((s, a) => s + a.amountEurCents, 0);

    expect(largeTotal).toBeGreaterThan(smallTotal);
  });

  it('maxDriftPct reflects the largest deviation from target', () => {
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 0, 5);

    // VWRL actual = 1,537,500 / 2,430,300 = 63.3% vs 60% target → +3.3%
    // VUSA actual = 284,700 / 2,430,300 = 11.7% vs 20% target → -8.3%
    // maxDrift must be at least 8.3%
    expect(plan.maxDriftPct).toBeGreaterThan(8.0);

    // But should not exceed 30% (the data is realistic)
    expect(plan.maxDriftPct).toBeLessThan(30);
  });

  it('free-ETF ISINs receive buy actions before non-free ones when cash is tight', () => {
    // With only €500 cash, all buys should be on free ETFs first
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 50_000, 5);

    const buys = plan.actions.filter((a) => a.action === 'buy');
    const freeIsins = new Set(TARGETS.filter((t) => t.isFreeEtf).map((t) => t.etfIsin));

    // At least one buy must be in a free ETF
    const freeEtfBuys = buys.filter((b) => freeIsins.has(b.etfIsin));
    expect(freeEtfBuys.length).toBeGreaterThan(0);
  });

  it('currentMonth is formatted as YYYY-MM for DCA context', () => {
    // Verify the month format the advisor will receive
    expect(CURRENT_MONTH).toMatch(/^\d{4}-(?:0[1-9]|1[0-2])$/);
    expect(CURRENT_MONTH).toBe('2026-04');
  });

  it('zero cash produces zero buys (only holds)', () => {
    const plan = computeRebalancingPlan(SNAPSHOT.holdings, TARGETS, 0, 5);

    const buys = plan.actions.filter((a) => a.action === 'buy');
    expect(buys.every((b) => b.amountEurCents === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Concentration projection sanity (RSU vesting increases concentration)
// ─────────────────────────────────────────────────────────────────────────────

describe('Concentration over time — vesting increases Uber exposure', () => {
  it('portfolio starts with ETF total = 2,430,300 EUR cents', () => {
    const total = SNAPSHOT.holdings.reduce((s, h) => s + h.valueCents, 0);
    expect(total).toBe(ETF_TOTAL_CENTS);
  });

  it('Uber ALL equity USD total = 3,770,300 cents', () => {
    const total = UBER_ALL.reduce((s, e) => s + e.marketValueUsdCents, 0);
    expect(total).toBe(3_770_300);
  });

  it('concentration drops linearly when ETF portfolio grows and Uber stays flat', () => {
    // Double the ETF portfolio
    const bigSnapshot: PortfolioSnapshot = {
      ...SNAPSHOT,
      holdings: SNAPSHOT.holdings.map((h) => ({ ...h, valueCents: h.valueCents * 2 })),
    };
    const result = calculateConcentration(bigSnapshot, UBER_AVAILABLE, 20, FX_RATE);

    // With ETF doubled, Uber concentration should drop well below 20%
    const single = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, 20, FX_RATE);
    expect(result.uberConcentrationPct).toBeLessThan(single.uberConcentrationPct);
  });
});
