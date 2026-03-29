import type { UberRSUGrant } from '../types/index.js';

/**
 * Represents a single vesting event.
 */
export interface VestingEvent {
  /** Date when shares vest */
  date: string; // ISO 8601
  /** Number of RSUs vesting on this date */
  sharesVesting: number;
  /** Running cumulative total vested after this event */
  cumulativeVested: number;
  /** Whether this event is in the future (not yet vested) */
  isFuture: boolean;
}

/**
 * Result of computing a full vesting schedule.
 */
export interface VestingSchedule {
  grantId: string;
  totalRsus: number;
  vestedToDate: number;
  unvestedToDate: number;
  nextVestingDate: string | null; // ISO 8601
  nextVestingShares: number;
  events: VestingEvent[];
}

/**
 * Parse the vesting formula string into cliff and monthly parameters.
 *
 * Supported format: "3/48 at month 3, then 1/48 monthly"
 *   - cliff: 3/48 shares vest at month 3
 *   - monthly: 1/48 shares vest each month thereafter
 *
 * @param formula - Vesting formula string from UberRSUGrant
 * @param totalRsus - Total RSUs in the grant
 * @returns Parsed vesting parameters
 *
 * @example
 * parseVestingFormula("3/48 at month 3, then 1/48 monthly", 480)
 * // => { cliffNumerator: 3, cliffDenominator: 48, cliffMonth: 3,
 * //       monthlyNumerator: 1, monthlyDenominator: 48 }
 */
export function parseVestingFormula(
  formula: string,
  totalRsus: number,
): {
  cliffShares: number;
  cliffMonthOffset: number;
  monthlyShares: number;
  totalMonths: number;
} {
  // TODO Phase 1B: implement full formula parser
  // For now, hardcode the standard Uber formula: 3/48 cliff + 1/48 monthly
  const cliffFraction = 3 / 48;
  const monthlyFraction = 1 / 48;
  const cliffShares = Math.floor(totalRsus * cliffFraction);
  const monthlyShares = Math.floor(totalRsus * monthlyFraction);

  void formula; // will be parsed in Phase 1B
  return {
    cliffShares,
    cliffMonthOffset: 3,
    monthlyShares,
    totalMonths: 48,
  };
}

/**
 * Compute the full vesting schedule for an RSU grant.
 *
 * Uber standard formula: 3/48 cliff at month 3, then 1/48 monthly.
 * All computations use integer arithmetic to avoid floating point errors.
 *
 * @param grant - The RSU grant
 * @param asOfDate - ISO 8601 date to compute vested/unvested counts (defaults to today)
 * @returns Full vesting schedule with individual events
 *
 * @example
 * computeVestingSchedule(grant, '2026-03-01')
 * // => { grantId: 'U121543', vestedToDate: 83, unvestedToDate: 419, ... }
 */
export function computeVestingSchedule(grant: UberRSUGrant, asOfDate?: string): VestingSchedule {
  // TODO Phase 1B: implement full vesting schedule computation
  void asOfDate;
  const parsed = parseVestingFormula(grant.vestingFormula, grant.totalRsus);

  return {
    grantId: grant.grantId,
    totalRsus: grant.totalRsus,
    vestedToDate: 0, // Phase 1B
    unvestedToDate: grant.totalRsus, // Phase 1B
    nextVestingDate: null, // Phase 1B
    nextVestingShares: parsed.monthlyShares,
    events: [], // Phase 1B
  };
}

/**
 * Calculate how many RSUs have vested as of a given date.
 *
 * @param grant - The RSU grant
 * @param asOfDate - ISO 8601 date to check
 * @returns Number of RSUs vested as of that date
 */
export function getVestedCount(grant: UberRSUGrant, asOfDate: string): number {
  // TODO Phase 1B: implement
  void grant;
  void asOfDate;
  return 0;
}

/**
 * Get the next vesting event after a given date.
 *
 * @param grant - The RSU grant
 * @param afterDate - ISO 8601 date — find next event after this date
 * @returns The next vesting event or null if fully vested
 */
export function getNextVestingEvent(
  grant: UberRSUGrant,
  afterDate: string,
): VestingEvent | null {
  // TODO Phase 1B: implement
  void grant;
  void afterDate;
  return null;
}
