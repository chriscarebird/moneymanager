import { describe, it, expect } from 'vitest';
import type { Holding, TargetAllocation } from '../types/index.js';
import {
  computeRebalancingPlan,
  getCurrentAllocations,
  MINIMUM_ORDER_EUR_CENTS,
  DEGIRO_DEFAULT_FEE_CENTS,
} from '../calculations/rebalancing.js';

// ── Reference holdings (from SPEC §2, same as concentration test) ─────────────
const HOLDINGS: Holding[] = [
  {
    snapshotId: 'snap_test',
    assetType: 'ETF',
    name: 'VWRL',
    isin: 'IE00B3RBWM25',
    quantity: 112,
    priceCents: 13728,
    valueCents: 1_537_500,
    exchange: 'XETRA',
  },
  {
    snapshotId: 'snap_test',
    assetType: 'ETF',
    name: 'VUSA',
    isin: 'IE00B3XXRP09',
    quantity: 27,
    priceCents: 10546,
    valueCents: 284_700,
    exchange: 'XETRA',
  },
  {
    snapshotId: 'snap_test',
    assetType: 'ETF',
    name: 'IUSN',
    isin: 'IE00BF4RFH31',
    quantity: 339,
    priceCents: 780,
    valueCents: 264_400,
    exchange: 'XETRA',
  },
  {
    snapshotId: 'snap_test',
    assetType: 'ETF',
    name: 'VAGE',
    isin: 'IE00BG47KB92',
    quantity: 59,
    priceCents: 2040,
    valueCents: 120_400,
    exchange: 'XETRA',
  },
];

// Simple 4-ETF target allocation summing to 100%
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
    targetPct: 20,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  },
  {
    id: 't3',
    assetClass: 'Small Cap',
    etfIsin: 'IE00BF4RFH31',
    etfName: 'IUSN',
    targetPct: 12,
    exchange: 'XETRA',
    isFreeEtf: true,
    active: true,
  },
  {
    id: 't4',
    assetClass: 'Bonds',
    etfIsin: 'IE00BG47KB92',
    etfName: 'VAGE',
    targetPct: 8,
    exchange: 'XETRA',
    isFreeEtf: false,
    active: true,
  },
];

// Total portfolio value: 1,537,500 + 284,700 + 264,400 + 120,400 = 2,207,000 cents
const TOTAL_VALUE = 2_207_000;

// ── getCurrentAllocations ─────────────────────────────────────────────────────

describe('getCurrentAllocations', () => {
  it('sums to 100%', () => {
    const allocs = getCurrentAllocations(HOLDINGS);
    const total = Array.from(allocs.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('VWRL is the largest position', () => {
    const allocs = getCurrentAllocations(HOLDINGS);
    const vwrl = allocs.get('IE00B3RBWM25') ?? 0;
    for (const [isin, pct] of allocs) {
      if (isin !== 'IE00B3RBWM25') {
        expect(vwrl).toBeGreaterThan(pct);
      }
    }
  });

  it('returns empty map for empty holdings', () => {
    expect(getCurrentAllocations([])).toEqual(new Map());
  });
});

// ── computeRebalancingPlan — basic properties ─────────────────────────────────

describe('computeRebalancingPlan — basic properties', () => {
  const CASH = 500_000; // €5,000
  const plan = computeRebalancingPlan(HOLDINGS, TARGETS, CASH, 5);

  it('total portfolio value matches holdings (excl. cash)', () => {
    expect(plan.totalValueEurCents).toBe(TOTAL_VALUE);
  });

  it('available cash is reported correctly', () => {
    expect(plan.availableCashEurCents).toBe(CASH);
  });

  it('has an action for each target', () => {
    expect(plan.actions).toHaveLength(TARGETS.length);
  });

  it('all sharesDelta values are whole integers', () => {
    for (const action of plan.actions) {
      expect(Number.isInteger(action.sharesDelta)).toBe(true);
    }
  });

  it('sharesDelta is non-negative (no forced sells with new cash)', () => {
    for (const action of plan.actions) {
      expect(action.sharesDelta).toBeGreaterThanOrEqual(0);
    }
  });

  it('total deployed does not exceed available cash', () => {
    expect(plan.totalDeployedEurCents).toBeLessThanOrEqual(CASH);
  });

  it('buy actions have estimatedFeeCents matching isFreeEtf (0 for free, 200 for paid)', () => {
    const targetMap = new Map(TARGETS.map((t) => [t.etfIsin, t]));
    for (const action of plan.actions.filter((a) => a.action === 'buy')) {
      const isFree = targetMap.get(action.etfIsin)?.isFreeEtf ?? false;
      expect(action.estimatedFeeCents).toBe(isFree ? 0 : DEGIRO_DEFAULT_FEE_CENTS);
    }
  });
});

// ── computeRebalancingPlan — buys underweight positions ──────────────────────

describe('computeRebalancingPlan — underweight targeting', () => {
  it('buys VUSA (currently underweight vs 20% target)', () => {
    // Current VUSA allocation: 284,700 / (2,207,000 + 500,000) ≈ 10.5% vs 20% target
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 500_000, 5);
    const vusa = plan.actions.find((a) => a.etfIsin === 'IE00B3XXRP09');
    expect(vusa?.action).toBe('buy');
    expect(vusa?.sharesDelta).toBeGreaterThan(0);
  });

  it('buys IUSN (currently underweight vs 12% target)', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 500_000, 5);
    const iusn = plan.actions.find((a) => a.etfIsin === 'IE00BF4RFH31');
    // IUSN at 264,400 / 2,707,000 ≈ 9.76% vs 12% target → underweight
    expect(iusn?.action).toBe('buy');
  });

  it('deployed amount is a multiple of share price for each position', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 500_000, 5);
    for (const action of plan.actions.filter((a) => a.action === 'buy')) {
      const holding = HOLDINGS.find((h) => h.isin === action.etfIsin);
      if (holding) {
        // amountEurCents = sharesDelta × priceCents
        expect(action.amountEurCents).toBe(action.sharesDelta * holding.priceCents);
      }
    }
  });
});

// ── computeRebalancingPlan — minimum order threshold ─────────────────────────

describe('computeRebalancingPlan — minimum order threshold', () => {
  it('skips a tiny €1 cash amount (below minimum order)', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 100, 5); // €0.01
    const buys = plan.actions.filter((a) => a.action === 'buy');
    expect(buys).toHaveLength(0);
  });

  it('marks skipped actions correctly', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 100, 5);
    const skipped = plan.actions.filter((a) => a.skipped);
    // Some actions should be skipped since cash is too small
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('custom minimumOrderEurCents is respected', () => {
    // With €10,000 cash but very high minimum (€100,000), expect no buys
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 1_000_000, 5, undefined, 100_000_000);
    const buys = plan.actions.filter((a) => a.action === 'buy');
    expect(buys).toHaveLength(0);
  });
});

// ── computeRebalancingPlan — rebalancing trigger ──────────────────────────────

describe('computeRebalancingPlan — drift detection', () => {
  it('flags rebalancingRecommended when drift > threshold', () => {
    // VUSA is ~10.5% vs 20% target → drift = ~9.5%, above 5% threshold
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 500_000, 5);
    expect(plan.rebalancingRecommended).toBe(true);
    expect(plan.maxDriftPct).toBeGreaterThan(5);
  });

  it('does not flag when all positions are within threshold', () => {
    // Use targets that closely match current allocation
    const currentAllocs = getCurrentAllocations(HOLDINGS);
    const nearTargets: TargetAllocation[] = HOLDINGS.map((h, i) => ({
      id: `t${i}`,
      assetClass: 'Equity',
      etfIsin: h.isin,
      etfName: h.name,
      targetPct: currentAllocs.get(h.isin) ?? 25,
      exchange: 'XETRA',
      isFreeEtf: true,
      active: true,
    }));
    const plan = computeRebalancingPlan(HOLDINGS, nearTargets, 0, 5);
    expect(plan.rebalancingRecommended).toBe(false);
    expect(plan.maxDriftPct).toBeLessThanOrEqual(5);
  });
});

// ── computeRebalancingPlan — inactive targets ignored ────────────────────────

describe('computeRebalancingPlan — inactive targets', () => {
  it('ignores inactive targets', () => {
    const withInactive: TargetAllocation[] = [
      ...TARGETS,
      {
        id: 't99',
        assetClass: 'Crypto',
        etfIsin: 'XX99',
        etfName: 'FAKE',
        targetPct: 5,
        exchange: 'XETRA',
        isFreeEtf: false,
        active: false,
      },
    ];
    const plan = computeRebalancingPlan(HOLDINGS, withInactive, 500_000, 5);
    expect(plan.actions).toHaveLength(TARGETS.length); // inactive not included
    expect(plan.actions.find((a) => a.etfIsin === 'XX99')).toBeUndefined();
  });
});

// ── computeRebalancingPlan — zero cash ────────────────────────────────────────

describe('computeRebalancingPlan — zero cash', () => {
  it('produces no buy actions with zero cash', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 0, 5);
    expect(plan.actions.filter((a) => a.action === 'buy')).toHaveLength(0);
    expect(plan.totalDeployedEurCents).toBe(0);
  });

  it('still reports drift correctly with zero cash', () => {
    const plan = computeRebalancingPlan(HOLDINGS, TARGETS, 0, 5);
    // With no investable = 0 cash, all positions are at 0% vs target → large drift
    expect(plan.maxDriftPct).toBeGreaterThan(0);
  });
});

// ── computeRebalancingPlan — minimum order constant ──────────────────────────

describe('MINIMUM_ORDER_EUR_CENTS', () => {
  it('is €200 (fee = €2 = 1% of €200)', () => {
    expect(MINIMUM_ORDER_EUR_CENTS).toBe(20_000);
  });
});
