import { createClient, type Client } from '@libsql/client';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Repo root is 3 levels up from apps/api/src/db.ts
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let _client: Client | null = null;

/** Resolve a relative file: URL against the repo root so migrate and the
 *  API always connect to the same database file. */
function resolveDbUrl(url: string): string {
  if (url.startsWith('file:') && !url.startsWith('file:///') && !url.startsWith('file://')) {
    const filePath = url.slice(5);
    if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
      const abs = resolve(REPO_ROOT, filePath).replace(/\\/g, '/');
      return `file:${abs}`;
    }
  }
  return url;
}

/**
 * Returns a singleton libsql client connected to Turso (or local SQLite in dev).
 * Reads connection config from environment variables.
 */
export function getDbClient(): Client {
  if (_client) return _client;

  const rawUrl = process.env['TURSO_DATABASE_URL'];
  const authToken = process.env['TURSO_AUTH_TOKEN'];

  if (!rawUrl) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  const url = resolveDbUrl(rawUrl);

  _client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });

  return _client;
}
