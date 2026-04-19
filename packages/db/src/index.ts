import { createClient, type Client } from '@libsql/client';

export type { Client };

/**
 * Create a libsql client connected to Turso (or local SQLite).
 *
 * @param url - Database URL (e.g. "libsql://your-db.turso.io" or "file:./dev.db")
 * @param authToken - Turso auth token (not needed for local SQLite)
 * @returns Connected client
 *
 * @example
 * const db = createDbClient(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
 */
export function createDbClient(url: string, authToken?: string): Client {
  return createClient({ url, ...(authToken !== undefined ? { authToken } : {}) });
}

// Schema info
export { SCHEMA_TABLES } from './schema.js';
export type { SchemaTable } from './schema.js';

// Query helpers
export { getUserById, updateUserSettings } from './queries/users.js';
export {
  getSnapshots,
  getSnapshotWithHoldings,
  getLatestSnapshot,
  insertSnapshot,
  getSnapshotValueHistory,
} from './queries/portfolio.js';
export { getTransactionHistory, insertTransaction } from './queries/transactions.js';
export { getDeGiroEtfScores } from './queries/etfList.js';
export { getUberEquity, getRSUGrants, upsertUberEquity, upsertRSUGrant } from './queries/uber.js';
export {
  getPendingNotifications,
  markNotificationSent,
  insertNotification,
} from './queries/notifications.js';
export {
  getTargetAllocations,
  upsertTargetAllocation,
  deleteTargetAllocation,
} from './queries/allocations.js';
export { getCashBalance, setCashBalance } from './queries/cash.js';
export {
  getPendingTransfers,
  insertTransfer,
  updateTransferStatus,
} from './queries/transfers.js';
export {
  getTradingWindows,
  getNextTradingWindow,
  upsertTradingWindow,
  updateTradingWindowState,
} from './queries/tradingWindows.js';
export type { TradingWindow, TradingWindowState } from './queries/tradingWindows.js';
export {
  insertAdviceLog,
  getAdviceLog,
  markAdviceLogFollowed,
  markStaleAdvice,
} from './queries/adviceLog.js';
export {
  savePushSubscription,
  getPushSubscriptions,
  deletePushSubscription,
  getAlertSuppression,
  upsertAlertSuppression,
} from './queries/pushSubscriptions.js';
export type { PushSubscription } from './queries/pushSubscriptions.js';
export {
  insertMSSnapshot,
  getMSSnapshotHistory,
  getLatestMSSnapshot,
} from './queries/msSnapshots.js';
export type {
  MSEquitySnapshot,
  MSEquitySnapshotItem,
  MSEquityInput,
} from './queries/msSnapshots.js';
export {
  generateAndInsertVestingEvents,
  getVestingEvents,
  updateVestingEvent,
} from './queries/vestingEvents.js';
export type { VestingEventPatch } from './queries/vestingEvents.js';
