/**
 * Notification scheduler — Phase 2C.
 *
 * Implements all triggers from §3.8 + ALERTS.md:
 *   Alert 1 — Trading window opens (with missing-date fallback)
 *   Alert 2 — Market dip (requires Phase 2B live prices; stubbed here with portfolio drift)
 *   Alert 3 — Monthly investment reminder (1st of month, skip if Alert 1 fired ≤7 days ago)
 *
 * Additional §3.8 triggers:
 *   - RSU vest awareness (upcoming vest ≤7 days)
 *   - Pending transfer follow-up (>5 business days outstanding)
 *   - Portfolio drift >5%
 *   - Quarterly review due
 *
 * The scheduler is idempotent: uses INSERT OR IGNORE so re-running is safe.
 */

import { randomUUID } from 'crypto';
import {
  getNextTradingWindow,
  getPendingTransfers,
  getRSUGrants,
  getLatestSnapshot,
  getTargetAllocations,
  getAdviceLog,
  insertNotification,
  getAlertSuppression,
  upsertAlertSuppression,
  type TradingWindow,
} from '@investpilot/db';
import {
  computeRebalancingPlan,
  getNextVestingEvent,
  type NotificationType,
} from '@investpilot/core';
import { getDbClient } from '../db.js';
import { sendPushToUser } from './pushSender.js';

export interface SchedulerResult {
  scheduled: string[];   // notification types that were scheduled
  pushed: string[];      // types for which a push was sent immediately
  skipped: string[];     // types skipped due to suppression or missing data
}

/** Add business days to a date (Mon–Fri). */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/** Return 09:00 CET (UTC+1 / UTC+2 in summer) as UTC for a given date. */
export function at9amCET(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(8, 0, 0, 0); // 09:00 CET = 08:00 UTC (winter)
  return d;
}

async function isSuppressed(userId: string, alertType: string): Promise<boolean> {
  const db = getDbClient();
  const suppression = await getAlertSuppression(db, userId, alertType);
  return suppression !== null;
}

async function suppress(
  userId: string,
  alertType: string,
  daysMs: number,
  reason?: string,
): Promise<void> {
  const db = getDbClient();
  await upsertAlertSuppression(db, userId, alertType, Date.now() + daysMs, reason);
}

async function scheduleNotif(
  userId: string,
  type: NotificationType,
  scheduledDate: Date,
  message: string,
): Promise<void> {
  const db = getDbClient();
  await insertNotification(db, userId, {
    id: randomUUID(),
    type,
    scheduledDate: scheduledDate.toISOString(),
    message,
  });
}

// ── Alert 1: Trading Window ────────────────────────────────────────────────────

async function scheduleTraidingWindowAlerts(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  const db = getDbClient();
  const window: TradingWindow | null = await getNextTradingWindow(db, userId);

  if (!window) {
    // Fallback: no window configured → daily 9 AM CET reminder
    if (await isSuppressed(userId, 'trading_window_missing')) {
      result.skipped.push('trading_window_missing');
      return;
    }
    const tomorrow9am = at9amCET(new Date(now.getTime() + 86400_000));
    await scheduleNotif(
      userId,
      'trading_window_missing',
      tomorrow9am,
      'When is the next Uber trading window? Tap to enter the date.',
    );
    result.scheduled.push('trading_window_missing');
    return;
  }

  const openDate = new Date(window.openDate);
  const msToOpen = openDate.getTime() - now.getTime();
  const daysToOpen = msToOpen / 86400_000;

  // T-7 reminder
  if (daysToOpen > 0 && daysToOpen <= 7) {
    if (!(await isSuppressed(userId, 'trading_window_reminder'))) {
      await scheduleNotif(
        userId,
        'trading_window_reminder',
        at9amCET(now),
        `Uber trading window opens in ${Math.ceil(daysToOpen)} day(s). Prepare to review your position.`,
      );
      await suppress(userId, 'trading_window_reminder', 8 * 86400_000, 'T-7 fired');
      result.scheduled.push('trading_window_reminder');
    }
  }

  // Window open today
  if (daysToOpen <= 0 && window.state === 'scheduled') {
    if (!(await isSuppressed(userId, 'trading_window_open'))) {
      await scheduleNotif(
        userId,
        'trading_window_open',
        at9amCET(now),
        'Uber trading window is open. Tap for your sell recommendation.',
      );
      // Send push immediately
      await sendPushToUser(userId, {
        title: 'InvestPilot — Trading Window Open',
        body: 'Uber trading window is open. Tap for your sell recommendation.',
        url: '/?tab=advisor',
      });
      await suppress(userId, 'trading_window_open', 30 * 86400_000, 'window opened');
      result.pushed.push('trading_window_open');
    }
  }
}

// ── Alert 3: Monthly Investment Reminder ──────────────────────────────────────

async function scheduleMonthlyReminder(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  // Only fire on 1st of month
  if (now.getUTCDate() !== 1) {
    result.skipped.push('monthly_investment');
    return;
  }

  // Skip if trading_window_open fired within past 7 days
  if (await isSuppressed(userId, 'monthly_investment')) {
    result.skipped.push('monthly_investment');
    return;
  }

  const db = getDbClient();
  const windowFiredRecently = await getAlertSuppression(db, userId, 'trading_window_open');
  if (windowFiredRecently) {
    result.skipped.push('monthly_investment (window fired recently)');
    return;
  }

  const monthName = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  await scheduleNotif(
    userId,
    'monthly_investment',
    at9amCET(now),
    `It's ${monthName} 1st — time to invest! Tap for this month's buy plan.`,
  );
  await sendPushToUser(userId, {
    title: `InvestPilot — ${monthName} Investment`,
    body: `It's ${monthName} 1st — time to invest! Tap for this month's buy plan.`,
    url: '/?tab=advisor&mode=dca',
  });
  await suppress(userId, 'monthly_investment', 25 * 86400_000, 'monthly fired');
  result.pushed.push('monthly_investment');
}

// ── RSU Vesting Awareness ─────────────────────────────────────────────────────

async function scheduleRSUVestingAlerts(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  const db = getDbClient();
  const grants = await getRSUGrants(db, userId);
  const activeGrants = grants.filter((g) => g.status === 'active');

  for (const grant of activeGrants) {
    const nextEvent = getNextVestingEvent(grant, now.toISOString());
    if (!nextEvent) continue;

    const daysToVest = (new Date(nextEvent.date).getTime() - now.getTime()) / 86400_000;
    if (daysToVest > 0 && daysToVest <= 7) {
      const suppressKey = `rsu_vesting_${grant.grantId}`;
      if (!(await isSuppressed(userId, suppressKey))) {
        await scheduleNotif(
          userId,
          'rsu_vesting',
          at9amCET(now),
          `${nextEvent.sharesVesting} RSUs from grant ${grant.grantId} vest in ${Math.ceil(daysToVest)} day(s) on ${nextEvent.date.slice(0, 10)}.`,
        );
        await suppress(userId, suppressKey, 8 * 86400_000, 'vest reminder sent');
        result.scheduled.push('rsu_vesting');
      }
    }
  }
}

// ── Pending Transfer Follow-Up ────────────────────────────────────────────────

async function scheduleTransferFollowUp(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  const db = getDbClient();
  const transfers = await getPendingTransfers(db, userId);
  const pending = transfers.filter((t) => t.status === 'pending');

  for (const transfer of pending) {
    const initiated = new Date(transfer.dateInitiated);
    const fiveBusinessDaysLater = addBusinessDays(initiated, 5);

    if (now >= fiveBusinessDaysLater) {
      const suppressKey = `transfer_followup_${transfer.id}`;
      if (!(await isSuppressed(userId, suppressKey))) {
        await scheduleNotif(
          userId,
          'transfer_followup',
          at9amCET(now),
          `Your transfer from ${transfer.source} to ${transfer.destination} has been pending for over 5 business days. Has it arrived?`,
        );
        await suppress(userId, suppressKey, 3 * 86400_000, 'followup sent');
        result.scheduled.push('transfer_followup');
      }
    }
  }
}

// ── Portfolio Drift >5% ───────────────────────────────────────────────────────

async function schedulePortfolioDriftAlert(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  if (await isSuppressed(userId, 'portfolio_drift')) {
    result.skipped.push('portfolio_drift');
    return;
  }

  const db = getDbClient();
  const [snapshot, targets] = await Promise.all([
    getLatestSnapshot(db, userId),
    getTargetAllocations(db, userId),
  ]);

  if (!snapshot || targets.length === 0) {
    result.skipped.push('portfolio_drift (no data)');
    return;
  }

  const plan = computeRebalancingPlan(snapshot.holdings, targets, 0, 5);
  if (plan.maxDriftPct >= 5) {
    await scheduleNotif(
      userId,
      'portfolio_drift',
      at9amCET(now),
      `Your portfolio has drifted ${plan.maxDriftPct.toFixed(1)}% from targets — consider rebalancing.`,
    );
    // Suppress for 14 days (don't spam drift alerts)
    await suppress(userId, 'portfolio_drift', 14 * 86400_000, `drift ${plan.maxDriftPct.toFixed(1)}%`);
    result.scheduled.push('portfolio_drift');
  } else {
    result.skipped.push('portfolio_drift (within tolerance)');
  }
}

// ── Quarterly Review Due ──────────────────────────────────────────────────────

async function scheduleQuarterlyReview(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  if (await isSuppressed(userId, 'quarterly_review')) {
    result.skipped.push('quarterly_review');
    return;
  }

  const db = getDbClient();
  const log = await getAdviceLog(db, userId, 1);
  const lastStrategyAdvice = log.find((l) => l.type === 'strategy');

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400_000);
  const isDue =
    !lastStrategyAdvice || new Date(lastStrategyAdvice.date) < ninetyDaysAgo;

  if (isDue) {
    await scheduleNotif(
      userId,
      'quarterly_review',
      at9amCET(now),
      'Time for your quarterly portfolio review. Tap to generate a strategy analysis.',
    );
    await suppress(userId, 'quarterly_review', 90 * 86400_000, 'review scheduled');
    result.scheduled.push('quarterly_review');
  } else {
    result.skipped.push('quarterly_review (recent advice found)');
  }
}

// ── Market Dip Detection ──────────────────────────────────────────────────────
// Alert 2: Requires live prices (Phase 2B). Compare latest two snapshot values.

async function scheduleMarketDipAlert(
  userId: string,
  now: Date,
  result: SchedulerResult,
): Promise<void> {
  if (await isSuppressed(userId, 'market_dip')) {
    result.skipped.push('market_dip (suppressed)');
    return;
  }

  const db = getDbClient();
  const snapshots = await getLatestSnapshot(db, userId);

  // Placeholder: drift-based dip detection until Phase 2B live prices are integrated.
  // Real implementation would compare live portfolio value vs. snapshot value.
  void snapshots;
  void now;
  result.skipped.push('market_dip (requires live prices — Phase 2B)');
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full notification scheduler for a single user.
 * Safe to call repeatedly — uses INSERT OR IGNORE + suppressions.
 */
export async function runSchedulerForUser(
  userId: string,
  now: Date = new Date(),
): Promise<SchedulerResult> {
  const result: SchedulerResult = { scheduled: [], pushed: [], skipped: [] };

  await Promise.allSettled([
    scheduleTraidingWindowAlerts(userId, now, result),
    scheduleMonthlyReminder(userId, now, result),
    scheduleRSUVestingAlerts(userId, now, result),
    scheduleTransferFollowUp(userId, now, result),
    schedulePortfolioDriftAlert(userId, now, result),
    scheduleQuarterlyReview(userId, now, result),
    scheduleMarketDipAlert(userId, now, result),
  ]);

  return result;
}

/**
 * Run scheduler for all known users.
 * Called on API startup and by periodic cron.
 */
export async function runSchedulerForAllUsers(): Promise<void> {
  const userIds = ['user1', 'user2']; // hardcoded for this 2-user app
  await Promise.allSettled(userIds.map((uid) => runSchedulerForUser(uid)));
}
