import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

/**
 * Get (or create) the singleton Anthropic client.
 * Reads ANTHROPIC_API_KEY from environment variables.
 *
 * IMPORTANT: This module must only be imported server-side (apps/api or packages/ai).
 * Never import in frontend code — the API key would be exposed.
 *
 * @returns Anthropic SDK client
 * @throws If ANTHROPIC_API_KEY is not set
 *
 * @example
 * const client = getAnthropicClient();
 * const message = await client.messages.create({ ... });
 */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Cost-efficient model for parsing tasks (vision, document extraction).
 */
export const SONNET_MODEL = 'claude-sonnet-4-6' as const;

/**
 * Highest quality model for strategy and advisory tasks.
 */
export const OPUS_MODEL = 'claude-opus-4-6' as const;

// Backward compat aliases
export const DEFAULT_MODEL = SONNET_MODEL;
export const VISION_MODEL = SONNET_MODEL;
