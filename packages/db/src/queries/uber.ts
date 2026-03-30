import type { Client } from '@libsql/client';
import type { UberEquity, UberRSUGrant } from '@investpilot/core';

/**
 * Query helpers for uber_equity and uber_rsu_grants tables.
 * Phase 2 implementation — these are typed stubs.
 */

/**
 * Get all Uber equity positions for a user.
 *
 * @param client - libsql client
 * @param userId - User ID
 * @returns Array of equity positions
 */
export async function getUberEquity(client: Client, userId: string): Promise<UberEquity[]> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: `
      SELECT type, shares_held, shares_available_to_transact,
             market_value_usd_cents, holding_period_active
      FROM uber_equity
      WHERE user_id = ?
      ORDER BY type
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    type: row['type'] as 'RSU' | 'ESPP' | 'Direct_Shares',
    sharesHeld: row['shares_held'] as number,
    sharesAvailableToTransact: row['shares_available_to_transact'] as number,
    marketValueUsdCents: row['market_value_usd_cents'] as number,
    holdingPeriodActive: (row['holding_period_active'] as number) === 1,
  }));
}

/**
 * Get all active RSU grants for a user.
 *
 * @param client - libsql client
 * @param userId - User ID
 * @returns Array of RSU grants
 */
export async function getRSUGrants(client: Client, userId: string): Promise<UberRSUGrant[]> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: `
      SELECT grant_id, total_rsus, vesting_commencement_date,
             vesting_formula, date_of_grant, source_document_url, status
      FROM uber_rsu_grants
      WHERE user_id = ? AND status = 'active'
      ORDER BY vesting_commencement_date DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    grantId: row['grant_id'] as string,
    totalRsus: row['total_rsus'] as number,
    vestingCommencementDate: row['vesting_commencement_date'] as string,
    vestingFormula: row['vesting_formula'] as string,
    dateOfGrant: row['date_of_grant'] as string,
    sourceDocumentUrl: (row['source_document_url'] as string | null) ?? null,
    status: row['status'] as 'active' | 'fully_vested' | 'forfeited',
  }));
}

/**
 * Upsert an RSU grant (insert or update by grant_id).
 *
 * @param client - libsql client
 * @param userId - User ID
 * @param grant - RSU grant to upsert
 */
export async function upsertRSUGrant(
  client: Client,
  userId: string,
  grant: UberRSUGrant,
): Promise<void> {
  await client.execute({
    sql: `
      INSERT INTO uber_rsu_grants
        (grant_id, user_id, total_rsus, vesting_commencement_date,
         vesting_formula, date_of_grant, source_document_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (grant_id) DO UPDATE SET
        total_rsus = excluded.total_rsus,
        vesting_commencement_date = excluded.vesting_commencement_date,
        vesting_formula = excluded.vesting_formula,
        date_of_grant = excluded.date_of_grant,
        source_document_url = COALESCE(excluded.source_document_url, source_document_url),
        status = excluded.status
    `,
    args: [
      grant.grantId,
      userId,
      grant.totalRsus,
      grant.vestingCommencementDate,
      grant.vestingFormula,
      grant.dateOfGrant,
      grant.sourceDocumentUrl ?? null,
      grant.status,
    ],
  });
}

/**
 * Upsert Uber equity position (insert or update by user + type).
 *
 * @param client - libsql client
 * @param userId - User ID
 * @param equity - Equity position to upsert
 */
export async function upsertUberEquity(
  client: Client,
  userId: string,
  equity: UberEquity,
): Promise<void> {
  // TODO Phase 2: implement
  await client.execute({
    sql: `
      INSERT INTO uber_equity
        (user_id, type, shares_held, shares_available_to_transact, market_value_usd_cents, holding_period_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, type) DO UPDATE SET
        shares_held = excluded.shares_held,
        shares_available_to_transact = excluded.shares_available_to_transact,
        market_value_usd_cents = excluded.market_value_usd_cents,
        holding_period_active = excluded.holding_period_active,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `,
    args: [
      userId,
      equity.type,
      equity.sharesHeld,
      equity.sharesAvailableToTransact,
      equity.marketValueUsdCents,
      equity.holdingPeriodActive ? 1 : 0,
    ],
  });
}
