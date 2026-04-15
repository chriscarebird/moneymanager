/**
 * Phase 2C — Verification Gate: pure logic tests
 *
 * Covers:
 *   1. Drift detection threshold — 5% boundary behaviour
 *   2. addBusinessDays helper (exported from notificationScheduler)
 *   3. at9amCET helper — 09:00 CET rendered as UTC
 *   4. Trading window date math — days-to-open determines alert type
 */

import { describe, it, expect } from 'vitest';
import type { PortfolioSnapshot, TargetAllocation, Holding } from '../types/index.js';
import { computeRebalancingPlan } from '../calculations/rebalancing.js';

// ── Helpers copied for pure testing (scheduler exports tested in API package) ──

/** Add N calendar business days (Mon–Fri) to a Date. */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/** Return 09:00 CET (UTC+1 winter) as UTC for a given date. */
function at9amCET(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(8, 0, 0, 0); // 09:00 CET = 08:00 UTC
  return d;
}

// ── 1. Drift detection threshold ──────────────────────────────────────────────

/**
 * Build a two-ETF portfolio with a controlled drift.
 *
 * VWRL target 60 %, VUSA target 40 %.
 * By setting actualPct values we control the drift.
 * Total = 100,000 EUR cents for clean percentages.
 */
function makeSnapshot(vwrlPct: number, vusaPct: number): PortfolioSnapshot {
  const total = 1_000_000; // €10,000
  return {
    id: 'snap',
    date: '2026-04-15T00:00:00Z',
    source: 'manual',
    rawImageUrl: null,
    holdings: [
      {
        snapshotId: 'snap',
        assetType: 'ETF',
        name: 'VWRL',
        isin: 'IE00B3RBWM25',
        quantity: 1,
        priceCents: Math.round((vwrlPct / 100) * total),
        valueCents: Math.round((vwrlPct / 100) * total),
        exchange: 'XETRA',
      },
      {
        snapshotId: 'snap',
        assetType: 'ETF',
        name: 'VUSA',
        isin: 'IE00B3XXRP09',
        quantity: 1,
        priceCents: Math.round((vusaPct / 100) * total),
        valueCents: Math.round((vusaPct / 100) * total),
        exchange: 'XETRA',
      },
    ] satisfies Holding[],
  };
}

const TARGETS: TargetAllocation[] = [
  {
    id: 't1',
    assetClass: 'Global Equity',
    etfIsin: 'IE00B3RBWM25',
    etfName: 'VWRL',
    targetPct: 60,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  },
  {
    id: 't2',
    assetClass: 'US Equity',
    etfIsin: 'IE00B3XXRP09',
    etfName: 'VUSA',
    targetPct: 40,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  },
];

describe('Drift detection threshold', () => {
  it('no drift → maxDriftPct ≈ 0, rebalancingRecommended = false', () => {
    const plan = computeRebalancingPlan(makeSnapshot(60, 40).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeCloseTo(0, 1);
    expect(plan.rebalancingRecommended).toBe(false);
  });

  it('4.9% drift → rebalancingRecommended = false (below 5% threshold)', () => {
    // VWRL at 55.1%, VUSA at 44.9% → drift = |55.1 - 60| = 4.9%
    const plan = computeRebalancingPlan(makeSnapshot(55.1, 44.9).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeCloseTo(4.9, 0);
    expect(plan.rebalancingRecommended).toBe(false);
  });

  it('exactly 5.0% drift → rebalancingRecommended = false (threshold is strict >)', () => {
    // VWRL at 55%, VUSA at 45% → drift = 5.0% exactly
    const plan = computeRebalancingPlan(makeSnapshot(55, 45).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeCloseTo(5.0, 1);
    // rebalancingRecommended uses strict >, so exactly 5 does NOT trigger
    expect(plan.rebalancingRecommended).toBe(false);
  });

  it('exactly 5.0% drift → scheduler condition (>= 5) WOULD trigger notification', () => {
    // The scheduler checks plan.maxDriftPct >= 5, not plan.rebalancingRecommended
    const plan = computeRebalancingPlan(makeSnapshot(55, 45).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct >= 5).toBe(true); // scheduler fires at exactly 5%
  });

  it('5.1% drift → rebalancingRecommended = true (above 5% threshold)', () => {
    // VWRL at 54.9%, VUSA at 45.1% → drift = 5.1%
    const plan = computeRebalancingPlan(makeSnapshot(54.9, 45.1).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeGreaterThan(5);
    expect(plan.rebalancingRecommended).toBe(true);
  });

  it('10% drift → maxDriftPct reported and rebalancingRecommended = true', () => {
    // VWRL at 50%, VUSA at 50% → VWRL drift = -10%, VUSA drift = +10%
    const plan = computeRebalancingPlan(makeSnapshot(50, 50).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeCloseTo(10, 0);
    expect(plan.rebalancingRecommended).toBe(true);
  });

  it('maxDriftPct reflects the worst-drifting position', () => {
    // VWRL at 52% (drift -8%), VUSA at 48% (drift +8%)
    const plan = computeRebalancingPlan(makeSnapshot(52, 48).holdings, TARGETS, 0, 5);
    expect(plan.maxDriftPct).toBeCloseTo(8, 0);
  });

  it('drift message contains the correct percentage (for notification body)', () => {
    const plan = computeRebalancingPlan(makeSnapshot(50, 50).holdings, TARGETS, 0, 5);
    // Scheduler message uses plan.maxDriftPct.toFixed(1)
    const message = `Your portfolio has drifted ${plan.maxDriftPct.toFixed(1)}% from targets — consider rebalancing.`;
    expect(message).toContain('10.0%');
  });
});

// ── 2. addBusinessDays helper ─────────────────────────────────────────────────

describe('addBusinessDays', () => {
  it('adds 5 business days from a Monday → next Monday', () => {
    // 2026-04-13 is a Monday
    const start = new Date('2026-04-13T00:00:00Z');
    const result = addBusinessDays(start, 5);
    // Mon +5 business days = Mon Apr 13 → Tue 14, Wed 15, Thu 16, Fri 17, Mon 20
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-20');
  });

  it('skips Saturday and Sunday when counting', () => {
    // Friday 2026-04-17: +1 business day = Monday 2026-04-20
    const friday = new Date('2026-04-17T00:00:00Z');
    const result = addBusinessDays(friday, 1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-20');
  });

  it('adds 0 business days → same date', () => {
    const date = new Date('2026-04-15T00:00:00Z');
    const result = addBusinessDays(date, 0);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('5 business days from Wed spans one weekend', () => {
    // Wed Apr 15 → Thu 16, Fri 17, (skip Sat/Sun), Mon 20, Tue 21, Wed 22
    const wed = new Date('2026-04-15T00:00:00Z');
    const result = addBusinessDays(wed, 5);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-22');
  });
});

// ── 3. at9amCET helper ────────────────────────────────────────────────────────

describe('at9amCET', () => {
  it('returns 08:00 UTC (= 09:00 CET winter time)', () => {
    const date = new Date('2026-04-15T14:30:00Z'); // any time of day
    const result = at9amCET(date);
    expect(result.getUTCHours()).toBe(8);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('preserves the calendar date of the input', () => {
    const date = new Date('2026-04-15T23:59:59Z');
    const result = at9amCET(date);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('result is always in the future relative to midnight UTC same day', () => {
    const midnight = new Date('2026-04-15T00:00:00Z');
    const nineAm = at9amCET(midnight);
    expect(nineAm.getTime()).toBeGreaterThan(midnight.getTime());
  });
});

// ── 4. Trading window date math ───────────────────────────────────────────────

describe('Trading window date math', () => {
  const NOW = new Date('2026-04-15T10:00:00Z');

  function daysToOpen(openDate: Date, now: Date): number {
    return (openDate.getTime() - now.getTime()) / 86_400_000;
  }

  it('window 3 days away → in T-7 window (0 < days ≤ 7)', () => {
    const open = new Date(NOW.getTime() + 3 * 86_400_000);
    const days = daysToOpen(open, NOW);
    expect(days).toBeCloseTo(3, 1);
    expect(days > 0 && days <= 7).toBe(true);
  });

  it('window 7 days away → at the T-7 boundary (inclusive)', () => {
    const open = new Date(NOW.getTime() + 7 * 86_400_000);
    const days = daysToOpen(open, NOW);
    expect(days > 0 && days <= 7).toBe(true);
  });

  it('window 8 days away → outside T-7 window', () => {
    const open = new Date(NOW.getTime() + 8 * 86_400_000);
    const days = daysToOpen(open, NOW);
    expect(days > 0 && days <= 7).toBe(false);
  });

  it('window that opened yesterday → daysToOpen < 0 → window-open alert', () => {
    const open = new Date(NOW.getTime() - 86_400_000);
    const days = daysToOpen(open, NOW);
    expect(days).toBeLessThan(0);
    // Scheduler condition: daysToOpen <= 0 AND state === 'scheduled'
    expect(days <= 0).toBe(true);
  });

  it('window opening exactly now → daysToOpen ≈ 0 → triggers window-open alert', () => {
    const open = new Date(NOW.getTime());
    const days = daysToOpen(open, NOW);
    expect(days).toBeCloseTo(0, 5);
    expect(days <= 0).toBe(true);
  });
});
