#!/usr/bin/env node
/**
 * Seed script for InvestPilot reference portfolio data.
 *
 * Seeds:
 *   - 7 DeGiro ETF holdings (snapshot dated 2026-03-01)
 *   - 3 Uber equity positions (Direct Shares, ESPP, RSUs)
 *   - 1 Active RSU grant (U121543)
 *
 * Money values stored as INTEGER cents: €137.28 → 13728, $2,214 → 221400
 * Run: pnpm db:seed
 */

import { createClient } from '@libsql/client';

async function seed(): Promise<void> {
  const url = process.env['TURSO_DATABASE_URL'];
  const authToken = process.env['TURSO_AUTH_TOKEN'];

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  console.warn('Seeding database:', url);

  const client = createClient({ url, ...(authToken !== undefined ? { authToken } : {}) });

  // ── Portfolio Snapshot: 2026-03-01 ────────────────────────────────────────

  const snapshotId = 'snap_2026_03_01_degiro';
  const snapshotDate = '2026-03-01T00:00:00Z';
  const userId = 'user1';

  await client.execute({
    sql: `
      INSERT OR IGNORE INTO portfolio_snapshots (id, user_id, date, source, raw_image_url)
      VALUES (?, ?, ?, 'manual', NULL)
    `,
    args: [snapshotId, userId, snapshotDate],
  });

  console.warn('  Created portfolio snapshot:', snapshotId);

  // ── DeGiro ETF Holdings ───────────────────────────────────────────────────
  // Prices in EUR cents: €137.28 → 13728
  // Values in EUR cents: €15,375 → 1537500

  const holdings = [
    {
      asset_type: 'ETF',
      name: 'Vanguard FTSE All-World UCITS ETF (Dist)',
      isin: 'IE00B3RBWM25',
      quantity: 112,
      price_cents: 13728, // €137.28
      value_cents: 1537500, // €15,375 (112 × 137.28 ≈ 15,375)
      exchange: 'XETRA',
    },
    {
      asset_type: 'ETF',
      name: 'Vanguard S&P 500 UCITS ETF (Dist)',
      isin: 'IE00B3XXRP09',
      quantity: 27,
      price_cents: 10546, // €105.46
      value_cents: 284700, // €2,847 (27 × 105.46 ≈ 2,847)
      exchange: 'XETRA',
    },
    {
      asset_type: 'ETF',
      name: 'iShares MSCI World Small Cap UCITS ETF',
      isin: 'IE00BF4RFH31',
      quantity: 339,
      price_cents: 780, // €7.80
      value_cents: 264400, // €2,644 (339 × 7.80 ≈ 2,644)
      exchange: 'XETRA',
    },
    {
      asset_type: 'ETF',
      name: 'Vanguard Global Aggregate Bond UCITS ETF',
      isin: 'IE00BG47KB92',
      quantity: 59,
      price_cents: 2040, // €20.40
      value_cents: 120400, // €1,204 (59 × 20.40 ≈ 1,204)
      exchange: 'XETRA',
    },
    {
      asset_type: 'ETF',
      name: 'iShares AEX UCITS ETF (Dist)',
      isin: 'IE00B0M62Y33',
      quantity: 12,
      price_cents: 9577, // €95.77
      value_cents: 114900, // €1,149 (12 × 95.77 ≈ 1,149)
      exchange: 'AEX',
    },
    {
      asset_type: 'ETF',
      name: 'Invesco EQQQ NASDAQ-100 UCITS ETF',
      isin: 'IE0032077012',
      quantity: 2,
      price_cents: 49010, // €490.10
      value_cents: 98000, // €980 (2 × 490.10 ≈ 980)
      exchange: 'XETRA',
    },
    {
      asset_type: 'ETF',
      name: 'BNP Paribas Easy Bloomberg Europe Defensive',
      isin: 'LU3047998896',
      quantity: 10,
      price_cents: 1041, // €10.41
      value_cents: 10400, // €104 (10 × 10.41 ≈ 104)
      exchange: 'XETRA',
    },
  ] as const;

  for (const holding of holdings) {
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO holdings (snapshot_id, asset_type, name, isin, quantity, price_cents, value_cents, exchange)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        snapshotId,
        holding.asset_type,
        holding.name,
        holding.isin,
        holding.quantity,
        holding.price_cents,
        holding.value_cents,
        holding.exchange,
      ],
    });
    console.warn(
      `    + ${holding.name} (${holding.isin}): ${holding.quantity} shares @ €${(holding.price_cents / 100).toFixed(2)}`,
    );
  }

  // ── DeGiro ETF reference data ─────────────────────────────────────────────

  const etfListEntries = [
    {
      isin: 'IE00B3RBWM25',
      name: 'Vanguard FTSE All-World UCITS ETF (VWRL)',
      exchange: 'XETRA',
      is_core: 1,
    },
    {
      isin: 'IE00B3XXRP09',
      name: 'Vanguard S&P 500 UCITS ETF (VUSA)',
      exchange: 'XETRA',
      is_core: 1,
    },
    {
      isin: 'IE00BF4RFH31',
      name: 'iShares MSCI World Small Cap UCITS ETF (IUSN)',
      exchange: 'XETRA',
      is_core: 1,
    },
    {
      isin: 'IE00BG47KB92',
      name: 'Vanguard Global Aggregate Bond UCITS ETF (VAGE)',
      exchange: 'XETRA',
      is_core: 1,
    },
    {
      isin: 'IE00B0M62Y33',
      name: 'iShares AEX UCITS ETF Dist (IAEX)',
      exchange: 'AEX',
      is_core: 0,
    },
    {
      isin: 'IE0032077012',
      name: 'Invesco EQQQ NASDAQ-100 UCITS ETF (EQQQ)',
      exchange: 'XETRA',
      is_core: 0,
    },
    {
      isin: 'LU3047998896',
      name: 'BNP Paribas Easy Bloomberg Europe Defensive (BJL8)',
      exchange: 'XETRA',
      is_core: 0,
    },
  ] as const;

  for (const etf of etfListEntries) {
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO degiro_etf_list (isin, name, exchange, is_core_selection)
        VALUES (?, ?, ?, ?)
      `,
      args: [etf.isin, etf.name, etf.exchange, etf.is_core],
    });
  }

  console.warn('  Seeded DeGiro ETF reference list');

  // ── Uber Equity ───────────────────────────────────────────────────────────
  // Values in USD cents: $2,214 → 221400, $12,314 → 1231400, $23,175 → 2317500

  const uberEquityPositions = [
    {
      type: 'Direct_Shares',
      shares_held: 32,
      shares_available: 32,
      market_value_usd_cents: 221400, // $2,214
      holding_period_active: 0,
    },
    {
      type: 'ESPP',
      shares_held: 178,
      shares_available: 178,
      market_value_usd_cents: 1231400, // $12,314
      holding_period_active: 1,
    },
    {
      type: 'RSU',
      shares_held: 335,
      shares_available: 0, // unvested, cannot transact
      market_value_usd_cents: 2317500, // $23,175
      holding_period_active: 0,
    },
  ] as const;

  for (const equity of uberEquityPositions) {
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO uber_equity
          (user_id, type, shares_held, shares_available_to_transact, market_value_usd_cents, holding_period_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        userId,
        equity.type,
        equity.shares_held,
        equity.shares_available,
        equity.market_value_usd_cents,
        equity.holding_period_active,
      ],
    });
    console.warn(
      `    + Uber ${equity.type}: ${equity.shares_held} shares @ $${(equity.market_value_usd_cents / 100).toFixed(0)}`,
    );
  }

  // ── Uber RSU Grant U121543 ────────────────────────────────────────────────

  await client.execute({
    sql: `
      INSERT OR IGNORE INTO uber_rsu_grants
        (grant_id, user_id, total_rsus, vesting_commencement_date, vesting_formula, date_of_grant, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      'U121543',
      userId,
      502,
      '2024-11-16T00:00:00Z', // 16-Nov-2024 vesting commencement
      '3/48 at month 3, then 1/48 monthly',
      '2024-11-16T00:00:00Z', // grant date (same as commencement for this grant)
      'active',
    ],
  });

  console.warn('  Seeded RSU grant U121543: 502 RSUs, vesting from 2024-11-16');

  // ── Target Allocations ────────────────────────────────────────────────────
  // 5 core DeGiro ETFs summing to 100%

  const targetAllocations = [
    {
      id: 'target_vwrl',
      asset_class: 'Global Equity',
      etf_isin: 'IE00B3RBWM25',
      etf_name: 'Vanguard FTSE All-World (VWRL)',
      target_pct: 60,
      exchange: 'XETRA',
      is_free_etf: 1,
    },
    {
      id: 'target_vusa',
      asset_class: 'US Equity',
      etf_isin: 'IE00B3XXRP09',
      etf_name: 'Vanguard S&P 500 (VUSA)',
      target_pct: 20,
      exchange: 'XETRA',
      is_free_etf: 1,
    },
    {
      id: 'target_iusn',
      asset_class: 'Small Cap',
      etf_isin: 'IE00BF4RFH31',
      etf_name: 'iShares MSCI World Small Cap (IUSN)',
      target_pct: 10,
      exchange: 'XETRA',
      is_free_etf: 1,
    },
    {
      id: 'target_vage',
      asset_class: 'Bonds',
      etf_isin: 'IE00BG47KB92',
      etf_name: 'Vanguard Global Aggregate Bond (VAGE)',
      target_pct: 5,
      exchange: 'XETRA',
      is_free_etf: 1,
    },
    {
      id: 'target_iaex',
      asset_class: 'Netherlands',
      etf_isin: 'IE00B0M62Y33',
      etf_name: 'iShares AEX UCITS (IAEX)',
      target_pct: 5,
      exchange: 'AEX',
      is_free_etf: 0,
    },
  ] as const;

  for (const alloc of targetAllocations) {
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO target_allocations
          (id, user_id, asset_class, etf_isin, etf_name, target_pct, exchange, is_free_etf, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      args: [
        alloc.id,
        userId,
        alloc.asset_class,
        alloc.etf_isin,
        alloc.etf_name,
        alloc.target_pct,
        alloc.exchange,
        alloc.is_free_etf,
      ],
    });
  }

  console.warn('  Seeded 5 target allocations (VWRL 60%, VUSA 20%, IUSN 10%, VAGE 5%, IAEX 5%)');

  // ── Cash Balance ─────────────────────────────────────────────────────────

  await client.execute({
    sql: `
      INSERT OR IGNORE INTO cash_balances (id, user_id, amount_cents, date_updated)
      VALUES (?, ?, ?, ?)
    `,
    args: ['cash_seed_001', userId, 50000, '2026-03-01T00:00:00Z'], // €500.00
  });

  console.warn('  Seeded cash balance: €500.00');

  console.warn('\nSeed complete.');
  client.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
