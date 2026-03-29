/**
 * API response envelope type used by all InvestPilot API endpoints.
 *
 * @example
 * // Success
 * { data: { id: '1', name: 'user1' }, error: null }
 *
 * // Error
 * { data: null, error: 'Invalid credentials' }
 *
 * // With pagination meta
 * { data: [...], error: null, meta: { total: 42, page: 1, perPage: 20 } }
 */
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};
