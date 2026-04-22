import { describe, it, expect } from 'vitest';
import type { UberRSUGrant } from '../types/index.js';
import {
  parseVestingFormula,
  addCalendarMonths,
  computeVestingSchedule,
  stackVestingSchedules,
  getVestedCount,
  getNextVestingEvent,
} from '../calculations/vesting.js';

// ── Reference grant: U121543 ──────────────────────────────────────────────────
// 502 RSUs, commencement 16-Nov-2024, formula "3/48 at month 3, then 1/48 monthly"

const GRANT_U121543: UberRSUGrant = {
  grantId: 'U121543',
  totalRsus: 502,
  vestingCommencementDate: '2024-11-16T00:00:00.000Z',
  vestingFormula: '3/48 at month 3, then 1/48 monthly',
  dateOfGrant: '2024-11-16T00:00:00.000Z',
  sourceDocumentUrl: null,
  status: 'active',
};

// ── parseVestingFormula ───────────────────────────────────────────────────────

describe('parseVestingFormula', () => {
  it('parses the standard Uber formula', () => {
    const result = parseVestingFormula('3/48 at month 3, then 1/48 monthly');
    expect(result.cliffMonthOffset).toBe(3);
    expect(result.denominator).toBe(48);
  });

  it('is case-insensitive', () => {
    const result = parseVestingFormula('3/48 AT MONTH 3, THEN 1/48 MONTHLY');
    expect(result.cliffMonthOffset).toBe(3);
    expect(result.denominator).toBe(48);
  });

  it('parses pure monthly "1/48 monthly" with cliff at month 1', () => {
    const result = parseVestingFormula('1/48 monthly');
    expect(result.cliffMonthOffset).toBe(1);
    expect(result.denominator).toBe(48);
  });

  it('parses "1/48 per month" as pure monthly', () => {
    const result = parseVestingFormula('1/48 per month');
    expect(result.cliffMonthOffset).toBe(1);
    expect(result.denominator).toBe(48);
  });

  it('throws on an unrecognised formula', () => {
    expect(() => parseVestingFormula('vest 25% per year')).toThrow();
  });
});

// ── addCalendarMonths ─────────────────────────────────────────────────────────

describe('addCalendarMonths', () => {
  it('adds months within the same year', () => {
    const base = new Date('2024-11-16T00:00:00.000Z');
    const result = addCalendarMonths(base, 3);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(result.getUTCDate()).toBe(16);
  });

  it('rolls over year boundaries', () => {
    const base = new Date('2024-11-16T00:00:00.000Z');
    const result = addCalendarMonths(base, 16);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(2); // March
    expect(result.getUTCDate()).toBe(16);
  });

  it('clamps to last day of month on overflow (Jan 31 + 1 month)', () => {
    const base = new Date('2024-01-31T00:00:00.000Z');
    const result = addCalendarMonths(base, 1);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(29); // 2024 is a leap year
  });
});

// ── computeVestingSchedule — cliff ────────────────────────────────────────────

describe('computeVestingSchedule — cliff event', () => {
  it('first vest is ~31 shares on 16-Feb-2025', () => {
    // As of one day before cliff, nothing has vested
    const schedule = computeVestingSchedule(GRANT_U121543, '2025-02-15T00:00:00.000Z');
    expect(schedule.vestedToDate).toBe(0);
    const firstEvent = schedule.events[0]!;
    expect(firstEvent.sharesVesting).toBe(31); // floor(502 × 3/48) = 31
    expect(firstEvent.date.startsWith('2025-02-16')).toBe(true);
    expect(firstEvent.isFuture).toBe(true);
  });

  it('cliff is vested as of 16-Feb-2025 exactly', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2025-02-16T00:00:00.000Z');
    expect(schedule.vestedToDate).toBe(31);
    const firstEvent = schedule.events[0]!;
    expect(firstEvent.isFuture).toBe(false);
  });
});

// ── computeVestingSchedule — monthly cadence ─────────────────────────────────

describe('computeVestingSchedule — monthly events', () => {
  it('subsequent monthly vests average ~10.5 shares', () => {
    // Use as-of = fully vested so we can inspect all events
    const schedule = computeVestingSchedule(GRANT_U121543, '2030-01-01T00:00:00.000Z');
    const monthlyEvents = schedule.events.slice(1); // skip cliff
    const totalMonthly = monthlyEvents.reduce((s, e) => s + e.sharesVesting, 0);
    const avg = totalMonthly / monthlyEvents.length;
    // Should be close to 502/48 ≈ 10.46
    expect(avg).toBeGreaterThan(10);
    expect(avg).toBeLessThan(11);
  });

  it('all event share counts are 10 or 11 (rounding from 10.46)', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2030-01-01T00:00:00.000Z');
    const monthlyEvents = schedule.events.slice(1);
    for (const event of monthlyEvents) {
      expect(event.sharesVesting).toBeGreaterThanOrEqual(10);
      expect(event.sharesVesting).toBeLessThanOrEqual(11);
    }
  });

  it('total vested across all events equals totalRsus exactly', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2030-01-01T00:00:00.000Z');
    const total = schedule.events.reduce((s, e) => s + e.sharesVesting, 0);
    expect(total).toBe(502);
  });
});

// ── computeVestingSchedule — vestedToDate ─────────────────────────────────────

describe('computeVestingSchedule — vestedToDate reference snapshot', () => {
  it('reports 167 vested as of 2026-03-16 (spec reference)', () => {
    // As of 16-Mar-2026 (16 months since commencement):
    // floor(502 × 16/48) = floor(167.33) = 167
    const schedule = computeVestingSchedule(GRANT_U121543, '2026-03-16T00:00:00.000Z');
    expect(schedule.vestedToDate).toBe(167);
    expect(schedule.unvestedToDate).toBe(335); // 502 − 167
  });

  it('reports 0 vested before cliff (2025-01-01)', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2025-01-01T00:00:00.000Z');
    expect(schedule.vestedToDate).toBe(0);
    expect(schedule.unvestedToDate).toBe(502);
  });

  it('reports 502 vested when fully past vesting period', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2029-01-01T00:00:00.000Z');
    expect(schedule.vestedToDate).toBe(502);
    expect(schedule.unvestedToDate).toBe(0);
    expect(schedule.nextVestingDate).toBeNull();
  });
});

// ── computeVestingSchedule — nextVestingDate ──────────────────────────────────

describe('computeVestingSchedule — nextVestingDate', () => {
  it('next vest after 2026-03-01 is on 2026-03-16 with ~10 shares', () => {
    const schedule = computeVestingSchedule(GRANT_U121543, '2026-03-01T00:00:00.000Z');
    expect(schedule.nextVestingDate).not.toBeNull();
    expect(schedule.nextVestingDate!.startsWith('2026-03-16')).toBe(true);
    // floor(502 × 16/48) − floor(502 × 15/48) = 167 − 156 = 11
    expect(schedule.nextVestingShares).toBe(11);
  });
});

// ── getVestedCount ────────────────────────────────────────────────────────────

describe('getVestedCount', () => {
  it('matches vestedToDate from computeVestingSchedule', () => {
    expect(getVestedCount(GRANT_U121543, '2026-03-16T00:00:00.000Z')).toBe(167);
    expect(getVestedCount(GRANT_U121543, '2025-02-15T00:00:00.000Z')).toBe(0);
  });
});

// ── getNextVestingEvent ───────────────────────────────────────────────────────

describe('getNextVestingEvent', () => {
  it('returns the next future event', () => {
    const event = getNextVestingEvent(GRANT_U121543, '2026-03-01T00:00:00.000Z');
    expect(event).not.toBeNull();
    expect(event!.date.startsWith('2026-03-16')).toBe(true);
  });

  it('returns null when fully vested', () => {
    const event = getNextVestingEvent(GRANT_U121543, '2029-01-01T00:00:00.000Z');
    expect(event).toBeNull();
  });
});

// ── stackVestingSchedules ─────────────────────────────────────────────────────

describe('stackVestingSchedules', () => {
  it('stacks two grants that share a vest date', () => {
    // Create a second identical grant for testing stacking
    const grant2: UberRSUGrant = {
      ...GRANT_U121543,
      grantId: 'U999',
      totalRsus: 100,
    };
    const s1 = computeVestingSchedule(GRANT_U121543, '2030-01-01T00:00:00.000Z');
    const s2 = computeVestingSchedule(grant2, '2030-01-01T00:00:00.000Z');
    const stacked = stackVestingSchedules([s1, s2]);

    // Total shares across all stacked events should equal both grants
    const total = stacked.reduce((s, e) => s + e.sharesVesting, 0);
    expect(total).toBe(502 + 100);
  });

  it('preserves chronological order', () => {
    const s1 = computeVestingSchedule(GRANT_U121543, '2030-01-01T00:00:00.000Z');
    const stacked = stackVestingSchedules([s1]);
    for (let i = 1; i < stacked.length; i++) {
      expect(stacked[i]!.date >= stacked[i - 1]!.date).toBe(true);
    }
  });
});
