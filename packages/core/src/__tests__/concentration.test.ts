import { describe, it, expect } from 'vitest';
import type { PortfolioSnapshot, UberEquity } from '../types/index.js';
import type { UberRSUGrant } from '../types/index.js';
import {
  calculateConcentration,
  getTotalUberValueUsdCents,
  getTotalPortfolioValueEurCents,
  getSnapshotValueEurCents,
  projectConcentrations,
} from '../calculations/concentration.js';
import { computeVestingSchedule } from '../calculations/vesting.js';

// ── Reference portfolio (from SPEC §2) ───────────────────────────────────────
//
// DeGiro holdings (EUR cents):
//   VWRL  112 × €137.28 = €15,375 → 1,537,500 cents
//   VUSA   27 × €105.46 = €2,847  →   284,700
//   IUSN  339 × €7.80   = €2,644  →   264,400
//   VAGE   59 × €20.40  = €1,204  →   120,400
//   IAEX   12 × €95.77  = €1,149  →   114,900
//   EQQQ    2 × €490.10 = €980    →    98,000
//   BJL8   10 × €10.41  = €104    →    10,400
//                 Total            = 2,430,300 cents ≈ €24,303
//
// Morgan Stanley (USD cents, available only):
//   Direct Shares  32 × ~$69.19 = $2,214 →   221,400
//   ESPP          178 × ~$69.18 = $12,314 → 1,231,400
//                 Total available         = 1,452,800 cents = $14,528
//
// At FX rate 0.92:
//   Uber EUR = 1,452,800 × 0.92 = 1,336,576 cents
//   Total    = 2,430,300 + 1,336,576 = 3,766,876 cents
//   Uber %   = 1,336,576 / 3,766,876 ≈ 35.48% ≈ ~36%

const SNAPSHOT: PortfolioSnapshot = {
  id: 'snap_test',
  date: '2026-03-01T00:00:00.000Z',
  source: 'manual',
  rawImageUrl: null,
  holdings: [
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'VWRL', isin: 'IE00B3RBWM25', quantity: 112, priceCents: 13728, valueCents: 1_537_500, exchange: 'XETRA' },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'VUSA', isin: 'IE00B3XXRP09', quantity: 27,  priceCents: 10546, valueCents:   284_700, exchange: 'XETRA' },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'IUSN', isin: 'IE00BF4RFH31', quantity: 339, priceCents:   780, valueCents:   264_400, exchange: 'XETRA' },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'VAGE', isin: 'IE00BG47KB92', quantity: 59,  priceCents:  2040, valueCents:   120_400, exchange: 'XETRA' },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'IAEX', isin: 'IE00B0M62Y33', quantity: 12,  priceCents:  9577, valueCents:   114_900, exchange: 'AEX'   },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'EQQQ', isin: 'IE0032077012', quantity: 2,   priceCents: 49010, valueCents:    98_000, exchange: 'XETRA' },
    { snapshotId: 'snap_test', assetType: 'ETF', name: 'BJL8', isin: 'LU3047998896', quantity: 10,  priceCents:  1041, valueCents:    10_400, exchange: 'XETRA' },
  ],
};

// Available-only Uber equity (Direct Shares + ESPP, not unvested RSUs)
const UBER_AVAILABLE: UberEquity[] = [
  { type: 'Direct_Shares', sharesHeld: 32,  sharesAvailableToTransact: 32,  marketValueUsdCents: 221_400,   holdingPeriodActive: false },
  { type: 'ESPP',          sharesHeld: 178, sharesAvailableToTransact: 178, marketValueUsdCents: 1_231_400, holdingPeriodActive: false },
];

// All Uber equity including unvested RSUs
const UBER_ALL: UberEquity[] = [
  ...UBER_AVAILABLE,
  { type: 'RSU', sharesHeld: 335, sharesAvailableToTransact: 0, marketValueUsdCents: 2_317_500, holdingPeriodActive: false },
];

const FX_RATE = 0.92;
const CONCENTRATION_LIMIT = 20;

// ── getSnapshotValueEurCents ──────────────────────────────────────────────────

describe('getSnapshotValueEurCents', () => {
  it('sums all holdings correctly', () => {
    const value = getSnapshotValueEurCents(SNAPSHOT);
    expect(value).toBe(2_430_300);
  });
});

// ── getTotalUberValueUsdCents ─────────────────────────────────────────────────

describe('getTotalUberValueUsdCents', () => {
  it('sums available equity to $14,528', () => {
    expect(getTotalUberValueUsdCents(UBER_AVAILABLE)).toBe(1_452_800);
  });

  it('sums all equity to $37,703', () => {
    expect(getTotalUberValueUsdCents(UBER_ALL)).toBe(3_770_300);
  });
});

// ── getTotalPortfolioValueEurCents ────────────────────────────────────────────

describe('getTotalPortfolioValueEurCents', () => {
  it('converts USD and sums with EUR holdings', () => {
    const total = getTotalPortfolioValueEurCents(SNAPSHOT, UBER_AVAILABLE, FX_RATE);
    // ETF: 2,430,300 + Uber: round(1,452,800 × 0.92) = 1,336,576
    expect(total).toBe(2_430_300 + Math.round(1_452_800 * FX_RATE));
  });
});

// ── calculateConcentration — reference portfolio ──────────────────────────────

describe('calculateConcentration — reference portfolio (available only)', () => {
  it('produces ~35-36% Uber concentration', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    // DeGiro €24,303 + Uber ~€13,366 → Uber ≈ 35.5%
    expect(result.uberConcentrationPct).toBeGreaterThan(35);
    expect(result.uberConcentrationPct).toBeLessThan(37);
  });

  it('is over the 20% limit', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    expect(result.isOverLimit).toBe(true);
  });

  it('suggests a positive sell amount in USD', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    expect(result.suggestedSellUsdCents).toBeGreaterThan(0);
  });

  it('selling the suggested amount brings concentration to exactly the limit', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    const sellEur = Math.ceil(result.suggestedSellUsdCents * FX_RATE);
    const newUberEur = result.uberEquityEurCents - sellEur;
    const newTotal = result.totalValueEurCents - sellEur;
    const newPct = (newUberEur / newTotal) * 100;
    // After selling, should be at or just below the limit (within rounding tolerance)
    expect(newPct).toBeLessThanOrEqual(CONCENTRATION_LIMIT + 0.1);
  });

  it('returns zero suggestedSell when under the limit', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, 40, FX_RATE);
    expect(result.isOverLimit).toBe(false);
    expect(result.suggestedSellUsdCents).toBe(0);
  });
});

describe('calculateConcentration — total values', () => {
  it('uberEquityUsdCents matches input sum', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    expect(result.uberEquityUsdCents).toBe(1_452_800);
  });

  it('totalValueEurCents = ETF value + converted Uber value', () => {
    const result = calculateConcentration(SNAPSHOT, UBER_AVAILABLE, CONCENTRATION_LIMIT, FX_RATE);
    const expected = 2_430_300 + Math.round(1_452_800 * FX_RATE);
    expect(result.totalValueEurCents).toBe(expected);
  });
});

// ── projectConcentrations ─────────────────────────────────────────────────────

const GRANT_U121543: UberRSUGrant = {
  grantId: 'U121543',
  totalRsus: 502,
  vestingCommencementDate: '2024-11-16T00:00:00.000Z',
  vestingFormula: '3/48 at month 3, then 1/48 monthly',
  dateOfGrant: '2024-11-16T00:00:00.000Z',
  sourceDocumentUrl: null,
  status: 'active',
};

// Uber price ≈ $69.28/share (from reference: $37,703 / 545 shares ≈ $69.18)
const UBER_PRICE_USD_CENTS = 6928; // $69.28

describe('projectConcentrations', () => {
  const schedule = computeVestingSchedule(GRANT_U121543, '2026-03-01T00:00:00.000Z');

  it('returns projections for [3, 6, 12] months by default', () => {
    const projections = projectConcentrations(
      2_430_300,
      1_452_800, // available Uber USD cents
      [schedule],
      UBER_PRICE_USD_CENTS,
      FX_RATE,
      '2026-03-01T00:00:00.000Z',
    );
    expect(projections).toHaveLength(3);
    expect(projections[0]!.monthsFromNow).toBe(3);
    expect(projections[1]!.monthsFromNow).toBe(6);
    expect(projections[2]!.monthsFromNow).toBe(12);
  });

  it('Uber concentration increases with each monthly vest (no selling assumed)', () => {
    const projections = projectConcentrations(
      2_430_300,
      1_452_800,
      [schedule],
      UBER_PRICE_USD_CENTS,
      FX_RATE,
      '2026-03-01T00:00:00.000Z',
    );
    // Concentration should grow over time as vesting adds Uber value
    expect(projections[1]!.projectedUberPct).toBeGreaterThan(projections[0]!.projectedUberPct);
    expect(projections[2]!.projectedUberPct).toBeGreaterThan(projections[1]!.projectedUberPct);
  });

  it('additional shares vest between now and 3-month projection', () => {
    const projections = projectConcentrations(
      2_430_300,
      1_452_800,
      [schedule],
      UBER_PRICE_USD_CENTS,
      FX_RATE,
      '2026-03-01T00:00:00.000Z',
    );
    // From Mar-2026 to Jun-2026: ~3 monthly vests of ~10-11 shares each
    expect(projections[0]!.additionalSharesVested).toBeGreaterThan(0);
    expect(projections[0]!.additionalSharesVested).toBeLessThanOrEqual(40); // 3 months × ~11 shares
  });

  it('accepts custom projection months', () => {
    const projections = projectConcentrations(
      2_430_300,
      1_452_800,
      [schedule],
      UBER_PRICE_USD_CENTS,
      FX_RATE,
      '2026-03-01T00:00:00.000Z',
      [1, 2],
    );
    expect(projections).toHaveLength(2);
    expect(projections[0]!.monthsFromNow).toBe(1);
    expect(projections[1]!.monthsFromNow).toBe(2);
  });
});
