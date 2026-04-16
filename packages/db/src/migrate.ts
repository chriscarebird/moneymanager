#!/usr/bin/env node
/**
 * Database migration runner for InvestPilot.
 * Reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from environment.
 * Runs all SQL migration files in order, skipping already-applied migrations.
 */

import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations(): Promise<void> {
  const rawUrl = process.env['TURSO_DATABASE_URL'];
  const authToken = process.env['TURSO_AUTH_TOKEN'];

  if (!rawUrl) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  // Resolve relative file: paths to absolute so migrate and the API hit the same file
  let url = rawUrl;
  if (url.startsWith('file:') && !url.startsWith('file:///') && !url.startsWith('file://')) {
    const filePath = url.slice(5);
    if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
      const abs = resolve(process.cwd(), filePath).replace(/\\/g, '/');
      url = `file:${abs}`;
    }
  }

  console.warn('Connecting to database:', url);

  const client = createClient({ url, ...(authToken ? { authToken } : {}) });

  // Ensure migrations table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  // Get already-applied migrations
  const applied = await client.execute('SELECT name FROM migrations ORDER BY name');
  const appliedNames = new Set(applied.rows.map((r) => r['name'] as string));

  // Find migration files
  const migrationsDir = resolve(__dirname, 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.warn(`Found ${migrationFiles.length} migration file(s)`);

  let applied_count = 0;
  let skipped_count = 0;

  for (const file of migrationFiles) {
    const migrationName = file.replace('.sql', '');

    if (appliedNames.has(migrationName)) {
      console.warn(`  ⏭  Skipping already-applied: ${file}`);
      skipped_count++;
      continue;
    }

    console.warn(`  ▶  Applying migration: ${file}`);
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');

    // Strip comment lines, split on semicolons, execute each statement
    const stripped = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

    const statements = stripped
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await client.execute(statement);
    }

    // Record migration (may already be inserted by the SQL itself — use OR IGNORE)
    await client.execute({
      sql: 'INSERT OR IGNORE INTO migrations (name) VALUES (?)',
      args: [migrationName],
    });

    console.warn(`  ✓  Applied: ${file}`);
    applied_count++;
  }

  console.warn(`\nMigrations complete: ${applied_count} applied, ${skipped_count} skipped`);
  client.close();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
