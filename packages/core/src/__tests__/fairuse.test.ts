import { describe, it, expect } from 'vitest';
import {
  checkFairUse,
  wouldBeFree,
  annotateTradeFees,
  optimiseTradeOrder,
  calculateTotalFees,
  emptyTracker,
  withTrade,
  FREE_CHAIN_MIN_CENTS,
  CHARGED_FEE_CENTS,
} from '../calculations/fairuse.js';
import type { DeGiroMonthlyTradeTracker } from '../types/index.js';

const MONTH = '2026-03';
const ISIN_VWRL = 'IE00B3RBWM25';
const ISIN_VUSA = 'IE00B3XXRP09';

// ── emptyTracker / withTrade helpers ─────────────────────────────────────────

describe('emptyTracker', () => {
  it('creates a tracker with no transactions', () => {
    const t = emptyTracker(ISIN_VWRL, MONTH);
    expect(t.transactions).toHaveLength(0);
  });
});

describe('withTrade', () => {
  it('appends a trade without mutating original', () => {
    const original = emptyTracker(ISIN_VWRL, MONTH);
    const updated = withTrade(original, { direction: 'buy', amountCents: 150_000, wasFree: true });
    expect(original.transactions).toHaveLength(0);
    expect(updated.transactions).toHaveLength(1);
  });
});

// ── checkFairUse — no trades ──────────────────────────────────────────────────

describe('checkFairUse — no trades', () => {
  it('has a free trade available', () => {
    const tracker = emptyTracker(ISIN_VWRL, MONTH);
    const status = checkFairUse(tracker, MONTH);
    expect(status.hasFreeTrade).toBe(true);
    expect(status.freeTradesUsed).toBe(0);
    expect(status.chainBroken).toBe(false);
    expect(status.requiredDirection).toBeNull();
    expect(status.estimatedFeeCents).toBe(0);
  });
});

// ── checkFairUse — after first trade ─────────────────────────────────────────

describe('checkFairUse — first trade executed', () => {
  it('counts the first trade as free regardless of direction or amount', () => {
    const tracker = withTrade(
      emptyTracker(ISIN_VWRL, MONTH),
      { direction: 'buy', amountCents: 50_000, wasFree: true }, // sub-€1,000 first trade
    );
    const status = checkFairUse(tracker, MONTH);
    expect(status.freeTradesUsed).toBe(1);
    expect(status.chainBroken).toBe(false); // chain not yet broken by a sub-min SECOND trade
    expect(status.requiredDirection).toBe('buy');
  });
});

// ── checkFairUse — chain intact ───────────────────────────────────────────────

describe('checkFairUse — chain intact (same direction, ≥€1,000)', () => {
  it('counts second same-direction ≥€1,000 trade as free', () => {
    const tracker = withTrade(
      withTrade(
        emptyTracker(ISIN_VWRL, MONTH),
        { direction: 'buy', amountCents: 200_000, wasFree: true },
      ),
      { direction: 'buy', amountCents: FREE_CHAIN_MIN_CENTS, wasFree: true },
    );
    const status = checkFairUse(tracker, MONTH);
    expect(status.freeTradesUsed).toBe(2);
    expect(status.chainBroken).toBe(false);
    expect(status.hasFreeTrade).toBe(true);
  });

  it('allows many consecutive same-direction ≥€1,000 trades', () => {
    let tracker = emptyTracker(ISIN_VWRL, MONTH);
    for (let i = 0; i < 5; i++) {
      tracker = withTrade(tracker, { direction: 'buy', amountCents: 200_000, wasFree: true });
    }
    const status = checkFairUse(tracker, MONTH);
    expect(status.freeTradesUsed).toBe(5);
    expect(status.chainBroken).toBe(false);
  });
});

// ── checkFairUse — chain broken by opposite direction ────────────────────────

describe('checkFairUse — chain broken by opposite direction', () => {
  it('marks chain as broken after opposite-direction second trade', () => {
    const tracker = withTrade(
      withTrade(
        emptyTracker(ISIN_VWRL, MONTH),
        { direction: 'buy', amountCents: 200_000, wasFree: true },
      ),
      { direction: 'sell', amountCents: 200_000, wasFree: false }, // opposite direction
    );
    const status = checkFairUse(tracker, MONTH);
    expect(status.chainBroken).toBe(true);
    expect(status.hasFreeTrade).toBe(false);
    expect(status.estimatedFeeCents).toBe(CHARGED_FEE_CENTS);
  });
});

// ── checkFairUse — chain broken by sub-€1,000 second trade ───────────────────

describe('checkFairUse — chain broken by sub-€1,000 second trade', () => {
  it('marks chain as broken after sub-€1,000 subsequent trade', () => {
    const tracker = withTrade(
      withTrade(
        emptyTracker(ISIN_VWRL, MONTH),
        { direction: 'buy', amountCents: 200_000, wasFree: true },
      ),
      { direction: 'buy', amountCents: 99_999, wasFree: false }, // < €1,000
    );
    const status = checkFairUse(tracker, MONTH);
    expect(status.chainBroken).toBe(true);
    expect(status.hasFreeTrade).toBe(false);
  });

  it('trades after chain break are all charged', () => {
    let tracker = emptyTracker(ISIN_VWRL, MONTH);
    tracker = withTrade(tracker, { direction: 'buy', amountCents: 200_000, wasFree: true });
    tracker = withTrade(tracker, { direction: 'buy', amountCents: 50_000, wasFree: false }); // breaks chain
    tracker = withTrade(tracker, { direction: 'buy', amountCents: 200_000, wasFree: false }); // charged
    const status = checkFairUse(tracker, MONTH);
    expect(status.chainBroken).toBe(true);
    expect(status.freeTradesUsed).toBe(1); // only first trade was free
  });
});

// ── wouldBeFree ───────────────────────────────────────────────────────────────

describe('wouldBeFree', () => {
  it('returns true for first trade (no prior trades)', () => {
    const status = checkFairUse(emptyTracker(ISIN_VWRL, MONTH), MONTH);
    expect(wouldBeFree(status, 'buy', 200_000)).toBe(true);
    expect(wouldBeFree(status, 'sell', 50_000)).toBe(true); // any direction/amount for first
  });

  it('returns true for qualifying subsequent trade', () => {
    const tracker = withTrade(
      emptyTracker(ISIN_VWRL, MONTH),
      { direction: 'buy', amountCents: 200_000, wasFree: true },
    );
    const status = checkFairUse(tracker, MONTH);
    expect(wouldBeFree(status, 'buy', FREE_CHAIN_MIN_CENTS)).toBe(true);
    expect(wouldBeFree(status, 'buy', FREE_CHAIN_MIN_CENTS + 1)).toBe(true);
  });

  it('returns false for opposite direction', () => {
    const tracker = withTrade(
      emptyTracker(ISIN_VWRL, MONTH),
      { direction: 'buy', amountCents: 200_000, wasFree: true },
    );
    const status = checkFairUse(tracker, MONTH);
    expect(wouldBeFree(status, 'sell', FREE_CHAIN_MIN_CENTS)).toBe(false);
  });

  it('returns false for sub-€1,000 subsequent trade', () => {
    const tracker = withTrade(
      emptyTracker(ISIN_VWRL, MONTH),
      { direction: 'buy', amountCents: 200_000, wasFree: true },
    );
    const status = checkFairUse(tracker, MONTH);
    expect(wouldBeFree(status, 'buy', 99_999)).toBe(false);
  });

  it('returns false when chain is broken', () => {
    const tracker = withTrade(
      withTrade(
        emptyTracker(ISIN_VWRL, MONTH),
        { direction: 'buy', amountCents: 200_000, wasFree: true },
      ),
      { direction: 'sell', amountCents: 200_000, wasFree: false },
    );
    const status = checkFairUse(tracker, MONTH);
    expect(wouldBeFree(status, 'buy', FREE_CHAIN_MIN_CENTS)).toBe(false);
  });
});

// ── annotateTradeFees ─────────────────────────────────────────────────────────

describe('annotateTradeFees', () => {
  it('marks first trade per ISIN as free', () => {
    const trackers = new Map<string, DeGiroMonthlyTradeTracker>([
      [ISIN_VWRL, emptyTracker(ISIN_VWRL, MONTH)],
      [ISIN_VUSA, emptyTracker(ISIN_VUSA, MONTH)],
    ]);
    const trades = [
      { isin: ISIN_VWRL, direction: 'buy' as const, amountCents: 200_000 },
      { isin: ISIN_VUSA, direction: 'buy' as const, amountCents: 150_000 },
    ];
    const result = annotateTradeFees(trades, trackers, MONTH);
    expect(result[0].isFree).toBe(true);
    expect(result[1].isFree).toBe(true);
    expect(calculateTotalFees(result)).toBe(0);
  });

  it('charges for sub-€1,000 second trade in same direction', () => {
    const trackers = new Map<string, DeGiroMonthlyTradeTracker>([
      [ISIN_VWRL, withTrade(emptyTracker(ISIN_VWRL, MONTH), { direction: 'buy', amountCents: 200_000, wasFree: true })],
    ]);
    const trades = [
      { isin: ISIN_VWRL, direction: 'buy' as const, amountCents: 50_000 }, // sub-€1,000
    ];
    const result = annotateTradeFees(trades, trackers, MONTH);
    expect(result[0].isFree).toBe(false);
    expect(result[0].feeCents).toBe(CHARGED_FEE_CENTS);
  });
});

// ── optimiseTradeOrder ────────────────────────────────────────────────────────

describe('optimiseTradeOrder', () => {
  it('puts new ISINs (free) before already-traded ISINs (may be charged)', () => {
    // VWRL has already been traded; VUSA has not
    const trackers = new Map<string, DeGiroMonthlyTradeTracker>([
      [ISIN_VWRL, withTrade(emptyTracker(ISIN_VWRL, MONTH), { direction: 'buy', amountCents: 200_000, wasFree: true })],
      [ISIN_VUSA, emptyTracker(ISIN_VUSA, MONTH)],
    ]);
    const trades = [
      { isin: ISIN_VWRL, direction: 'sell' as const, amountCents: 200_000 }, // will break chain (opposite dir)
      { isin: ISIN_VUSA, direction: 'buy' as const, amountCents: 150_000 },  // first trade, free
    ];
    const result = optimiseTradeOrder(trades, trackers, MONTH);
    // VUSA (free) should come first in optimal order
    expect(result[0].isin).toBe(ISIN_VUSA);
  });

  it('preserves all trades in the output', () => {
    const trackers = new Map<string, DeGiroMonthlyTradeTracker>();
    const trades = [
      { isin: ISIN_VWRL, direction: 'buy' as const, amountCents: 200_000 },
      { isin: ISIN_VUSA, direction: 'buy' as const, amountCents: 150_000 },
    ];
    const result = optimiseTradeOrder(trades, trackers, MONTH);
    expect(result).toHaveLength(2);
  });
});

// ── calculateTotalFees ────────────────────────────────────────────────────────

describe('calculateTotalFees', () => {
  it('sums fees correctly', () => {
    expect(calculateTotalFees([{ feeCents: 200 }, { feeCents: 0 }, { feeCents: 200 }])).toBe(400);
  });

  it('returns 0 for empty list', () => {
    expect(calculateTotalFees([])).toBe(0);
  });
});

// ── constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('FREE_CHAIN_MIN_CENTS is €1,000', () => {
    expect(FREE_CHAIN_MIN_CENTS).toBe(100_000);
  });

  it('CHARGED_FEE_CENTS is €2.00', () => {
    expect(CHARGED_FEE_CENTS).toBe(200);
  });
});
