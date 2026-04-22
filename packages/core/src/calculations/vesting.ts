import type { UberRSUGrant } from '../types/index.js';

/** A single vesting event. */
export interface VestingEvent {
  /** ISO 8601 date when shares vest */
  date: string;
  /** Shares vesting on this date */
  sharesVesting: number;
  /** Running cumulative total vested after this event */
  cumulativeVested: number;
  /** True if this event is in the future (not yet vested) */
  isFuture: boolean;
}

/** Full computed vesting schedule for one RSU grant. */
export interface VestingSchedule {
  grantId: string;
  totalRsus: number;
  vestedToDate: number;
  unvestedToDate: number;
  /** ISO 8601, or null if fully vested */
  nextVestingDate: string | null;
  nextVestingShares: number;
  events: VestingEvent[];
}

/** Parsed parameters extracted from a vesting formula string. */
export interface VestingFormulaParams {
  /** Month offset from commencement when cliff vests (e.g. 3) */
  cliffMonthOffset: number;
  /** Total vesting period in months (denominator, e.g. 48) */
  denominator: number;
}

/**
 * Parse the vesting formula string into cliff and period parameters.
 *
 * Supported formats:
 *   "3/48 at month 3, then 1/48 monthly"  — cliff + monthly (standard Uber RSU)
 *   "1/48 monthly"                         — pure monthly from month 1 (no cliff)
 *   "1/48 per month"                       — same, alternate phrasing
 *
 * @throws if the formula string cannot be parsed
 */
export function parseVestingFormula(formula: string): VestingFormulaParams {
  // Primary: "3/48 at month 3, then 1/48 monthly"
  const cliffMatch = formula.match(/^(\d+)\/(\d+)\s+at\s+month\s+(\d+)/i);
  if (cliffMatch) {
    const denominator = parseInt(cliffMatch[2]!, 10);
    const cliffMonthOffset = parseInt(cliffMatch[3]!, 10);
    return { cliffMonthOffset, denominator };
  }

  // Fallback: "1/48 monthly" or "1/48 per month" — treat as cliff at month 1
  const pureMonthlyMatch = formula.match(/^\d+\/(\d+)\s+(?:monthly|per\s+month)/i);
  if (pureMonthlyMatch) {
    const denominator = parseInt(pureMonthlyMatch[1]!, 10);
    return { cliffMonthOffset: 1, denominator };
  }

  throw new Error(`Unrecognised vesting formula: "${formula}"`);
}

/**
 * Add a whole number of calendar months to a UTC date, preserving the day.
 * If the resulting month is shorter, clamps to the last valid day
 * (e.g. Jan 31 + 1 month → Feb 28).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const originalDay = date.getUTCDate();
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, originalDay),
  );
  // If the day overflowed (e.g. Mar 31 → "Apr 31" → May 1), roll back
  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0); // last day of the previous month
  }
  return result;
}

/**
 * Compute the full vesting schedule for a single RSU grant.
 *
 * Uses the cumulative floor approach:
 *   cumulative(month) = floor(totalRsus × month / denominator)
 *   sharesVesting(month) = cumulative(month) − cumulative(month − 1)
 *
 * This guarantees the total of all events equals totalRsus exactly —
 * any rounding remainder is absorbed into later monthly events.
 *
 * @param grant - The RSU grant to compute
 * @param asOfDate - ISO 8601 reference date for isFuture / vestedToDate
 *   (defaults to today in UTC)
 */
export function computeVestingSchedule(grant: UberRSUGrant, asOfDate?: string): VestingSchedule {
  const { cliffMonthOffset, denominator } = parseVestingFormula(grant.vestingFormula);
  const commencement = new Date(grant.vestingCommencementDate);
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  const events: VestingEvent[] = [];
  let prevCumulative = 0;
  let vestedToDate = 0;
  let nextVestingDate: string | null = null;
  let nextVestingShares = 0;

  for (let month = cliffMonthOffset; month <= denominator; month++) {
    const cumulative = Math.floor((grant.totalRsus * month) / denominator);
    const sharesVesting = cumulative - prevCumulative;
    prevCumulative = cumulative;

    if (sharesVesting <= 0) continue;

    const vestDate = addCalendarMonths(commencement, month);
    const isFuture = vestDate > asOf;

    events.push({
      date: vestDate.toISOString(),
      sharesVesting,
      cumulativeVested: cumulative,
      isFuture,
    });

    if (!isFuture) {
      vestedToDate = cumulative;
    } else if (nextVestingDate === null) {
      nextVestingDate = vestDate.toISOString();
      nextVestingShares = sharesVesting;
    }
  }

  return {
    grantId: grant.grantId,
    totalRsus: grant.totalRsus,
    vestedToDate,
    unvestedToDate: grant.totalRsus - vestedToDate,
    nextVestingDate,
    nextVestingShares,
    events,
  };
}

/**
 * Stack multiple RSU grant schedules into a single merged, date-sorted timeline.
 * Events on the same date from different grants are combined into one entry.
 */
export function stackVestingSchedules(schedules: VestingSchedule[]): VestingEvent[] {
  const byDate = new Map<string, VestingEvent>();

  for (const schedule of schedules) {
    for (const event of schedule.events) {
      // Normalise to YYYY-MM-DD for grouping
      const key = event.date.slice(0, 10);
      const existing = byDate.get(key);
      if (existing) {
        existing.sharesVesting += event.sharesVesting;
        existing.cumulativeVested += event.sharesVesting;
      } else {
        byDate.set(key, { ...event });
      }
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Return how many RSUs have vested from a grant as of a given date.
 */
export function getVestedCount(grant: UberRSUGrant, asOfDate: string): number {
  return computeVestingSchedule(grant, asOfDate).vestedToDate;
}

/**
 * Return the next vesting event after a given date, or null if fully vested.
 */
export function getNextVestingEvent(grant: UberRSUGrant, afterDate: string): VestingEvent | null {
  const schedule = computeVestingSchedule(grant, afterDate);
  return schedule.events.find((e) => e.isFuture) ?? null;
}

/** Minimal shape used when inserting generated events into the DB. */
export interface VestingEventInsert {
  /** ISO 8601 date string (YYYY-MM-DD) */
  vestingDate: string;
  sharesVesting: number;
  incomeTaxRate: number;
}

/**
 * Derive the full list of vesting event rows from a grant's formula.
 * These are ready to insert into rsu_vesting_events; no price is known
 * at generation time.
 *
 * @param grant - The RSU grant
 * @param defaultTaxRate - Predicted income tax rate (default: 49.5% Dutch top rate)
 */
export function generateVestingEvents(
  grant: UberRSUGrant,
  defaultTaxRate = 0.495,
): VestingEventInsert[] {
  const schedule = computeVestingSchedule(grant);
  return schedule.events.map((ev) => ({
    vestingDate: ev.date.slice(0, 10), // YYYY-MM-DD
    sharesVesting: ev.sharesVesting,
    incomeTaxRate: defaultTaxRate,
  }));
}

/**
 * Compute predicted tax figures for a single vesting event.
 * All money values in USD cents.
 *
 * @returns grossValueUsdCents, taxUsdCents, predictedNetShares, netValueUsdCents
 */
export function computePredictedTax(
  sharesVesting: number,
  priceUsdCents: number,
  incomeTaxRate: number,
): {
  grossValueUsdCents: number;
  taxUsdCents: number;
  predictedNetShares: number;
  netValueUsdCents: number;
} {
  const grossValueUsdCents = sharesVesting * priceUsdCents;
  const taxUsdCents = Math.round(grossValueUsdCents * incomeTaxRate);
  // Shares withheld = floor(sharesVesting × taxRate), remainder paid as cash
  const predictedNetShares = sharesVesting - Math.floor(sharesVesting * incomeTaxRate);
  const netValueUsdCents = grossValueUsdCents - taxUsdCents;
  return { grossValueUsdCents, taxUsdCents, predictedNetShares, netValueUsdCents };
}
