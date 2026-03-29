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
 * Default model to use for InvestPilot AI features.
 * claude-sonnet is a good balance of capability and cost for financial analysis.
 */
export const DEFAULT_MODEL = 'claude-opus-4-5' as const;

/**
 * Model to use for screenshot/document parsing tasks.
 * claude-sonnet has vision capability for parsing portfolio screenshots.
 */
export const VISION_MODEL = 'claude-opus-4-5' as const;
