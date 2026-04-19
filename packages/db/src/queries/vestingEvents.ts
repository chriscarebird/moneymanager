import { randomUUID } from 'crypto';
import type { Client } from '@libsql/client';
import type { UberRSUGrant, VestingEventRow, VestingEventStatus } from '@investpilot/core';
import { generateVestingEvents } from '@investpilot/core';

export type { VestingEventRow, VestingEventStatus };

export interface VestingEventPatch {
  incomeTaxRate?: number;
  priceUsdCents?: number | null;
  actualSharesReceived?: number | null;
  status?: VestingEventStatus;
  notes?: string | null;
}

function rowToEvent(row: Record<string, unknown>): VestingEventRow {
  return {
    id: row['id'] as string,
    grantId: row['grant_id'] as string,
    vestingDate: row['vesting_date'] as string,
    sharesVesting: row['shares_vesting'] as number,
    incomeTaxRate: row['income_tax_rate'] as number,
    priceUsdCents: (row['price_usd_cents'] as number | null) ?? null,
    actualSharesReceived: (row['actual_shares_received'] as number | null) ?? null,
    status: row['status'] as VestingEventStatus,
    notes: (row['notes'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

/**
 * Derive vesting events from the grant formula and insert them.
 * Any existing events for this grant are replaced (allows re-generation
 * after grant corrections without leaving stale rows).
 *
 * Events that have already been manually set to 'vested' or 'cancelled'
 * are preserved with their actuals to avoid losing user data.
 */
export async function generateAndInsertVestingEvents(
  client: Client,
  userId: string,
  grant: UberRSUGrant,
  defaultTaxRate = 0.495,
): Promise<void> {
  // Fetch existing events so we can preserve user edits on already-vested rows
  const existing = await client.execute({
    sql: `SELECT vesting_date, income_tax_rate, price_usd_cents,
                 actual_shares_received, status, notes
          FROM rsu_vesting_events
          WHERE grant_id = ? AND user_id = ?`,
    args: [grant.grantId, userId],
  });
  const existingByDate = new Map<string, typeof existing.rows[number]>();
  for (const row of existing.rows) {
    existingByDate.set(row['vesting_date'] as string, row);
  }

  // Delete all existing events (we re-insert below, preserving actuals where needed)
  await client.execute({
    sql: `DELETE FROM rsu_vesting_events WHERE grant_id = ? AND user_id = ?`,
    args: [grant.grantId, userId],
  });

  const events = generateVestingEvents(grant, defaultTaxRate);

  for (const ev of events) {
    const prior = existingByDate.get(ev.vestingDate);
    // If the row was already vested/cancelled by the user, keep their actuals
    const status = (prior?.['status'] as VestingEventStatus | undefined) ?? 'upcoming';
    const taxRate =
      status !== 'upcoming' && prior
        ? (prior['income_tax_rate'] as number)
        : ev.incomeTaxRate;
    const priceUsdCents =
      prior ? (prior['price_usd_cents'] as number | null) ?? null : null;
    const actualShares =
      prior ? (prior['actual_shares_received'] as number | null) ?? null : null;
    const notes = prior ? (prior['notes'] as string | null) ?? null : null;

    await client.execute({
      sql: `
        INSERT INTO rsu_vesting_events
          (id, user_id, grant_id, vesting_date, shares_vesting, income_tax_rate,
           price_usd_cents, actual_shares_received, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        randomUUID(),
        userId,
        grant.grantId,
        ev.vestingDate,
        ev.sharesVesting,
        taxRate,
        priceUsdCents,
        actualShares,
        status,
        notes,
      ],
    });
  }
}

/**
 * Get all vesting events for a user, optionally filtered to one grant.
 * Ordered by vesting date ascending.
 */
export async function getVestingEvents(
  client: Client,
  userId: string,
  grantId?: string,
): Promise<VestingEventRow[]> {
  const result = await client.execute({
    sql: `
      SELECT id, grant_id, vesting_date, shares_vesting, income_tax_rate,
             price_usd_cents, actual_shares_received, status, notes,
             created_at, updated_at
      FROM rsu_vesting_events
      WHERE user_id = ?
        ${grantId ? 'AND grant_id = ?' : ''}
      ORDER BY vesting_date ASC
    `,
    args: grantId ? [userId, grantId] : [userId],
  });

  return result.rows.map((row) => rowToEvent(row as Record<string, unknown>));
}

/**
 * Partially update a vesting event (tax rate, actuals, status).
 */
export async function updateVestingEvent(
  client: Client,
  eventId: string,
  patch: VestingEventPatch,
): Promise<void> {
  const sets: string[] = [`updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`];
  const args: unknown[] = [];

  if (patch.incomeTaxRate !== undefined) {
    sets.push('income_tax_rate = ?');
    args.push(patch.incomeTaxRate);
  }
  if ('priceUsdCents' in patch) {
    sets.push('price_usd_cents = ?');
    args.push(patch.priceUsdCents ?? null);
  }
  if ('actualSharesReceived' in patch) {
    sets.push('actual_shares_received = ?');
    args.push(patch.actualSharesReceived ?? null);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    args.push(patch.status);
  }
  if ('notes' in patch) {
    sets.push('notes = ?');
    args.push(patch.notes ?? null);
  }

  if (sets.length === 1) return; // only timestamp, nothing to do

  args.push(eventId);
  await client.execute({
    sql: `UPDATE rsu_vesting_events SET ${sets.join(', ')} WHERE id = ?`,
    args: args as Parameters<Client['execute']>[0]['args'],
  });
}
