import { createClient, type Client } from '@libsql/client';
import { resolve } from 'path';

let _client: Client | null = null;

/** Resolve a relative file: URL to an absolute path so the same DB file is
 *  used regardless of which directory the process was started from. */
function resolveDbUrl(url: string): string {
  if (url.startsWith('file:') && !url.startsWith('file:///') && !url.startsWith('file://')) {
    const filePath = url.slice(5); // strip 'file:'
    if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
      const abs = resolve(process.cwd(), filePath).replace(/\\/g, '/');
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
