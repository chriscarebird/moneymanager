/**
 * Tests for computePositionPnL — unrealised P&L calculation
 */

import { describe, it, expect } from 'vitest';
import type { Holding, TransactionHistory } from '../types/index.js';
import { computePositionPnL } from '../calculations/performance.js';

const VWRL_ISIN = 'IE00B3RBWM25';
const VUSA_ISIN = 'IE00B3XXRP09';

function makeHolding(isin: string, name: string, priceCents: number, qty: number): Holding {
  return {
    snapshotId: 'snap1',
    assetType: 'ETF',
    name,
    isin,
    quantity: qty,
    priceCents,
    valueCents: priceCents * qty,
    exchange: 'XETRA',
  };
}

function makeBuy(
  isin: string,
  asset: string,
  priceCents: number,
  qty: number,
  feeCents = 0,
): TransactionHistory {
  return {
    id: `tx-${Math.random()}`,
    date: '2026-01-15T00:00:00Z',
    action: 'buy',
    asset,
    isin,
    quantity: qty,
    priceCents,
    feeCents,
    exchange: 'XETRA',
  };
}

describe('computePositionPnL', () => {
  it('returns zero gain when no transactions — costBasisEstimated = true', () => {
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 10000, 10)];
    const result = computePositionPnL(holdings, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gainCents).toBe(0);
    expect(result[0]!.gainPct).toBe(0);
    expect(result[0]!.costBasisEstimated).toBe(true);
    expect(result[0]!.costBasisCents).toBe(holdings[0]!.valueCents); // break-even
  });

  it('computes gain correctly for a single buy at lower price', () => {
    // Bought 10 shares at €80 (8000 cents), now worth €100 (10000 cents) each
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 10000, 10)]; // current: €100 * 10 = €1000
    const txs = [makeBuy(VWRL_ISIN, 'VWRL', 8000, 10)]; // bought at €80 * 10 = €800

    const result = computePositionPnL(holdings, txs);
    expect(result[0]!.costBasisCents).toBe(80000); // €800
    expect(result[0]!.gainCents).toBe(20000); // €200 gain
    expect(result[0]!.gainPct).toBeCloseTo(25, 1); // 25% gain
    expect(result[0]!.costBasisEstimated).toBe(false);
  });

  it('computes loss correctly for a single buy at higher price', () => {
    // Bought at €120, now worth €100 each
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 10000, 10)]; // €100 * 10 = €1000
    const txs = [makeBuy(VWRL_ISIN, 'VWRL', 12000, 10)]; // €120 * 10 = €1200

    const result = computePositionPnL(holdings, txs);
    expect(result[0]!.costBasisCents).toBe(120000);
    expect(result[0]!.gainCents).toBe(-20000); // €200 loss
    expect(result[0]!.gainPct).toBeCloseTo(-16.67, 1);
  });

  it('uses average cost across multiple buys at different prices', () => {
    // Buy 5 shares at €80, buy 5 shares at €100 → avg €90 × 10 = €900 cost basis
    // Current: 10 shares at €95 = €950
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 9500, 10)];
    const txs = [
      makeBuy(VWRL_ISIN, 'VWRL', 8000, 5), // 5 × €80 = €400
      makeBuy(VWRL_ISIN, 'VWRL', 10000, 5), // 5 × €100 = €500
    ];

    const result = computePositionPnL(holdings, txs);
    expect(result[0]!.costBasisCents).toBe(90000); // avg €90 × 10
    expect(result[0]!.gainCents).toBe(5000); // €950 - €900 = €50
    expect(result[0]!.costBasisEstimated).toBe(false);
  });

  it('includes transaction fees in cost basis', () => {
    // Buy 10 shares at €80 with €2 fee → cost = €800 + €2 = €802
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 9000, 10)]; // current €900
    const txs = [makeBuy(VWRL_ISIN, 'VWRL', 8000, 10, 200)]; // 200 cents = €2 fee

    const result = computePositionPnL(holdings, txs);
    expect(result[0]!.costBasisCents).toBe(80200); // (80 * 10 + 2) * (10/10) = 80200
    expect(result[0]!.gainCents).toBe(9000 * 10 - 80200); // €900 - €802
  });

  it('handles multiple positions independently', () => {
    const holdings = [
      makeHolding(VWRL_ISIN, 'VWRL', 10000, 10), // current €1000
      makeHolding(VUSA_ISIN, 'VUSA', 5000, 20), // current €1000
    ];
    const txs = [
      makeBuy(VWRL_ISIN, 'VWRL', 8000, 10), // cost €800 → gain €200
      makeBuy(VUSA_ISIN, 'VUSA', 6000, 20), // cost €1200 → loss €200
    ];

    const result = computePositionPnL(holdings, txs);
    const vwrl = result.find((r) => r.isin === VWRL_ISIN)!;
    const vusa = result.find((r) => r.isin === VUSA_ISIN)!;

    expect(vwrl.gainCents).toBe(20000);
    expect(vusa.gainCents).toBe(-20000);
  });

  it('falls back to name matching when isin is empty', () => {
    const holdings = [makeHolding(VWRL_ISIN, 'VWRL', 10000, 10)];
    const txs: TransactionHistory[] = [
      {
        ...makeBuy('', 'VWRL', 8000, 10), // no ISIN, match by name
        isin: '',
      },
    ];

    const result = computePositionPnL(holdings, txs);
    expect(result[0]!.gainCents).toBe(20000);
    expect(result[0]!.costBasisEstimated).toBe(false);
  });
});
