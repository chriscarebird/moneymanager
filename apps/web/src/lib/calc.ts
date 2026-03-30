/**
 * Client-side calculation helpers — mirrors logic from @investpilot/core
 * without importing the server package.
 */

import type { PortfolioSnapshot, UberEquity, UberRSUGrant, TargetAllocation } from './api.js';

/** EUR/USD FX rate — TODO: fetch live */
export const DEFAULT_FX_RATE = 0.92;

/** Uber concentration target / warning thresholds (%) */
export const CONCENTRATION_TARGET = 20;
export const CONCENTRATION_WARN = 25;
export const CONCENTRATION_DANGER = 35;

export function totalEtfEurCents(snapshot: PortfolioSnapshot): number {
  return snapshot.holdings.reduce((sum, h) => sum + h.valueCents, 0);
}

export function totalUberEurCents(equity: UberEquity[], fxRate = DEFAULT_FX_RATE): number {
  const usdCents = equity.reduce((sum, e) => sum + e.marketValueUsdCents, 0);
  return Math.round(usdCents * fxRate);
}

export function availableUberEurCents(equity: UberEquity[], fxRate = DEFAULT_FX_RATE): number {
  const usdCents = equity
    .filter((e) => e.sharesAvailableToTransact > 0)
    .reduce((sum, e) => sum + e.marketValueUsdCents, 0);
  return Math.round(usdCents * fxRate);
}

export function uberConcentrationPct(
  snapshot: PortfolioSnapshot,
  equity: UberEquity[],
  fxRate = DEFAULT_FX_RATE,
): number {
  const etf = totalEtfEurCents(snapshot);
  const uber = totalUberEurCents(equity, fxRate);
  if (etf + uber === 0) return 0;
  return (uber / (etf + uber)) * 100;
}

export function concentrationColor(pct: number): string {
  if (pct >= CONCENTRATION_DANGER) return '#ef4444'; // red-500
  if (pct >= CONCENTRATION_WARN) return '#f97316'; // orange-500
  return '#22c55e'; // green-500
}

/** Compute current vs. target allocation for a snapshot */
export function computeAllocationDrift(
  snapshot: PortfolioSnapshot,
  targets: TargetAllocation[],
): { isin: string; name: string; targetPct: number; actualPct: number; driftPct: number }[] {
  const total = totalEtfEurCents(snapshot);
  if (total === 0) return [];

  return targets
    .filter((t) => t.active)
    .map((t) => {
      const holding = snapshot.holdings.find((h) => h.isin === t.etfIsin);
      const actualPct = holding ? (holding.valueCents / total) * 100 : 0;
      return {
        isin: t.etfIsin,
        name: t.etfName,
        targetPct: t.targetPct,
        actualPct,
        driftPct: actualPct - t.targetPct,
      };
    });
}

/** Parse a vesting formula "3/48 at month 3, then 1/48 monthly" */
function parseFormula(formula: string): { cliffMonth: number; denom: number } {
  const m = formula.match(/(\d+)\/(\d+)\s+at\s+month\s+(\d+)/i);
  if (!m) return { cliffMonth: 3, denom: 48 };
  return { cliffMonth: parseInt(m[3]!, 10), denom: parseInt(m[2]!, 10) };
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, date.getUTCDate()));
  return d;
}

/** How many shares have vested by a given date */
function vestedByDate(grant: UberRSUGrant, asOf: Date): number {
  const start = new Date(grant.vestingCommencementDate);
  const { cliffMonth, denom } = parseFormula(grant.vestingFormula);
  let total = 0;
  for (let m = cliffMonth; m <= denom; m++) {
    const vestDate = addMonths(start, m);
    if (vestDate <= asOf) {
      total = Math.floor((grant.totalRsus * m) / denom);
    }
  }
  return total;
}

/** Additional shares vesting between two dates */
export function sharesVestingBetween(grants: UberRSUGrant[], from: Date, to: Date): number {
  return grants.reduce((sum, g) => {
    return sum + (vestedByDate(g, to) - vestedByDate(g, from));
  }, 0);
}

/** Next vest event for a single grant after a given date */
export function nextVestEvent(
  grant: UberRSUGrant,
  after: Date,
): { date: Date; shares: number } | null {
  const start = new Date(grant.vestingCommencementDate);
  const { cliffMonth, denom } = parseFormula(grant.vestingFormula);
  let prevVested = vestedByDate(grant, after);
  for (let m = cliffMonth; m <= denom; m++) {
    const vestDate = addMonths(start, m);
    if (vestDate > after) {
      const newTotal = Math.floor((grant.totalRsus * m) / denom);
      const shares = newTotal - prevVested;
      if (shares > 0) return { date: vestDate, shares };
      prevVested = newTotal;
    }
  }
  return null;
}

/** Project Uber concentration at N months from now */
export function projectConcentration(
  snapshot: PortfolioSnapshot,
  equity: UberEquity[],
  grants: UberRSUGrant[],
  uberPriceUsd: number, // cents per share
  months: number,
  fxRate = DEFAULT_FX_RATE,
): number {
  const now = new Date();
  const future = addMonths(now, months);
  const newShares = sharesVestingBetween(grants, now, future);
  const additionalUsdCents = newShares * uberPriceUsd;
  const etf = totalEtfEurCents(snapshot);
  const uberUsd = equity.reduce((sum, e) => sum + e.marketValueUsdCents, 0);
  const totalUberUsd = uberUsd + additionalUsdCents;
  const totalUberEur = Math.round(totalUberUsd * fxRate);
  if (etf + totalUberEur === 0) return 0;
  return (totalUberEur / (etf + totalUberEur)) * 100;
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}
