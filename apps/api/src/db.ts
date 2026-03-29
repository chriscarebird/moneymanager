import { createClient, type Client } from '@libsql/client';

let _client: Client | null = null;

/**
 * Returns a singleton libsql client connected to Turso (or local SQLite in dev).
 * Reads connection config from environment variables.
 */
export function getDbClient(): Client {
  if (_client) return _client;

  const url = process.env['TURSO_DATABASE_URL'];
  const authToken = process.env['TURSO_AUTH_TOKEN'];

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  _client = createClient({
    url,
    authToken: authToken ?? undefined,
  });

  return _client;
}
