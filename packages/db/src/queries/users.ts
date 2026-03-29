import type { Client } from '@libsql/client';
import type { User, UserSettings } from '@investpilot/core';

/**
 * Query helpers for the users table.
 * Phase 2 implementation — these are typed stubs.
 */

/**
 * Get a user by ID.
 *
 * @param client - libsql client
 * @param id - User ID ('user1' | 'user2')
 * @returns User or null if not found
 */
export async function getUserById(client: Client, id: string): Promise<User | null> {
  // TODO Phase 2: implement
  const result = await client.execute({
    sql: 'SELECT id, name, settings_json FROM users WHERE id = ?',
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  const settings = JSON.parse(row['settings_json'] as string) as UserSettings;
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    settings,
  };
}

/**
 * Update user settings.
 *
 * @param client - libsql client
 * @param id - User ID
 * @param settings - New settings object
 */
export async function updateUserSettings(
  client: Client,
  id: string,
  settings: UserSettings,
): Promise<void> {
  // TODO Phase 2: implement
  await client.execute({
    sql: 'UPDATE users SET settings_json = ? WHERE id = ?',
    args: [JSON.stringify(settings), id],
  });
}
