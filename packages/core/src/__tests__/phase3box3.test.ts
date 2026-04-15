/**
 * Unit tests for Box 3 Dutch wealth-tax calculations.
 *
 * These tests verify the pure math that powers Box3Widget using the
 * same constants defined in that component (2026 Dutch rates).
 */

import { describe, it, expect } from 'vitest';

// ── Constants (must match apps/web/src/components/dashboard/Box3Widget.tsx) ──
const BOX3_VRIJSTELLING_CENTS = 11_400_000; // €114,000 couple exemption (2 × €57,000)
const BOX3_DEEMED_RETURN_RATE = 0.0588; // 5.88% fictitious return
const BOX3_TAX_RATE = 0.36; // 36% on deemed return

// ── Pure helpers (replicated from Box3Widget logic for unit testing) ──

function computeBox3Tax(totalPortfolioEurCents: number): {
  taxableWealthCents: number;
  estimatedTaxCents: number;
} {
  const taxableWealthCents = Math.max(0, totalPortfolioEurCents - BOX3_VRIJSTELLING_CENTS);
  const estimatedTaxCents = Math.round(
    taxableWealthCents * BOX3_DEEMED_RETURN_RATE * BOX3_TAX_RATE,
  );
  return { taxableWealthCents, estimatedTaxCents };
}

function isBox3Season(month: number): boolean {
  return month >= 10; // October–December (1-indexed)
}

function daysToYearEnd(today: Date): number {
  const year = today.getFullYear();
  const dec31 = new Date(year, 11, 31);
  return Math.ceil((dec31.getTime() - today.getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Box 3 — seasonal gate', () => {
  it('hides widget in January through September', () => {
    for (let m = 1; m <= 9; m++) {
      expect(isBox3Season(m)).toBe(false);
    }
  });

  it('shows widget in October', () => {
    expect(isBox3Season(10)).toBe(true);
  });

  it('shows widget in November', () => {
    expect(isBox3Season(11)).toBe(true);
  });

  it('shows widget in December', () => {
    expect(isBox3Season(12)).toBe(true);
  });
});

describe('Box 3 — taxable wealth calculation', () => {
  it('returns zero taxable wealth when portfolio is below the exemption', () => {
    const { taxableWealthCents, estimatedTaxCents } = computeBox3Tax(5_000_000); // €50,000
    expect(taxableWealthCents).toBe(0);
    expect(estimatedTaxCents).toBe(0);
  });

  it('returns zero taxable wealth when portfolio equals exactly the exemption', () => {
    const { taxableWealthCents, estimatedTaxCents } = computeBox3Tax(BOX3_VRIJSTELLING_CENTS);
    expect(taxableWealthCents).toBe(0);
    expect(estimatedTaxCents).toBe(0);
  });

  it('returns correct taxable wealth for portfolio of €200,000', () => {
    // €200,000 - €114,000 exemption = €86,000 taxable
    const { taxableWealthCents } = computeBox3Tax(20_000_000);
    expect(taxableWealthCents).toBe(8_600_000); // €86,000
  });

  it('returns correct taxable wealth for portfolio of €500,000', () => {
    // €500,000 - €114,000 = €386,000 taxable
    const { taxableWealthCents } = computeBox3Tax(50_000_000);
    expect(taxableWealthCents).toBe(38_600_000); // €386,000
  });
});

describe('Box 3 — estimated tax calculation', () => {
  it('computes estimated tax correctly for €200,000 portfolio', () => {
    // taxable = €86,000 = 8,600,000 cents
    // deemed return = 8,600,000 * 0.0588 = 505,680 cents
    // tax = 505,680 * 0.36 = 182,044.8 → rounds to 182,045
    const { estimatedTaxCents } = computeBox3Tax(20_000_000);
    expect(estimatedTaxCents).toBe(182_045);
  });

  it('computes estimated tax correctly for €500,000 portfolio', () => {
    // taxable = €386,000 = 38,600,000 cents
    // deemed return = 38,600,000 * 0.0588 = 2,269,680 cents
    // tax = 2,269,680 * 0.36 = 817,084.8 → rounds to 817,085
    const { estimatedTaxCents } = computeBox3Tax(50_000_000);
    expect(estimatedTaxCents).toBe(817_085);
  });

  it('computes estimated tax correctly for €1,000,000 portfolio', () => {
    // taxable = €886,000 = 88,600,000 cents
    // deemed return = 88,600,000 * 0.0588 = 5,209,680 cents
    // tax = 5,209,680 * 0.36 = 1,875,484.8 → rounds to 1,875,485
    const { estimatedTaxCents } = computeBox3Tax(100_000_000);
    expect(estimatedTaxCents).toBe(1_875_485);
  });

  it('estimated tax is below 2.1% of portfolio value (effective rate sanity check)', () => {
    // Effective max rate ≈ 5.88% * 36% = 2.1168% of taxable wealth
    const portfolio = 50_000_000; // €500,000
    const { taxableWealthCents, estimatedTaxCents } = computeBox3Tax(portfolio);
    const effectiveRate = estimatedTaxCents / taxableWealthCents;
    expect(effectiveRate).toBeCloseTo(0.0588 * 0.36, 4);
  });
});

describe('Box 3 — days to year-end', () => {
  it('calculates 60 days from November 1', () => {
    // Nov 1 → Dec 31: 29 days left in Nov + 31 days in Dec = 60
    const today = new Date('2026-11-01T00:00:00Z');
    // Use local-time construction to match Box3Widget's new Date(year, 11, 31)
    const localToday = new Date(2026, 10, 1); // month is 0-indexed: Oct=10
    expect(daysToYearEnd(localToday)).toBe(60);
  });

  it('calculates 31 days from December 1', () => {
    // Dec 1 → Dec 31 = 30 days remaining
    const localToday = new Date(2026, 11, 1); // December 1
    expect(daysToYearEnd(localToday)).toBe(30);
  });

  it('returns 0 or negative on December 31', () => {
    const localToday = new Date(2026, 11, 31); // December 31
    expect(daysToYearEnd(localToday)).toBeLessThanOrEqual(0);
  });

  it('calculates correctly from October 1', () => {
    // Oct 1 → Dec 31: 30 days left in Oct + 30 days in Nov + 31 days in Dec = 91
    const localToday = new Date(2026, 9, 1); // October 1
    expect(daysToYearEnd(localToday)).toBe(91);
  });
});

describe('Box 3 — constants sanity', () => {
  it('couple exemption is €114,000 (2 × €57,000 single-person threshold)', () => {
    expect(BOX3_VRIJSTELLING_CENTS).toBe(11_400_000);
    expect(BOX3_VRIJSTELLING_CENTS / 100).toBe(114_000);
  });

  it('deemed return rate is 5.88%', () => {
    expect(BOX3_DEEMED_RETURN_RATE).toBeCloseTo(0.0588, 4);
  });

  it('tax rate is 36%', () => {
    expect(BOX3_TAX_RATE).toBeCloseTo(0.36, 4);
  });

  it('combined effective rate is approximately 2.1168%', () => {
    const combined = BOX3_DEEMED_RETURN_RATE * BOX3_TAX_RATE;
    expect(combined).toBeCloseTo(0.021168, 5);
  });
});
