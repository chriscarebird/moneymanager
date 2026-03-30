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
} from './queries/portfolio.js';
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
