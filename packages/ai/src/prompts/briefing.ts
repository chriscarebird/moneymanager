import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, SONNET_MODEL } from '../client.js';
import type { PortfolioSnapshot, UberEquity, UberRSUGrant } from '@investpilot/core';

/**
 * Input for the monthly portfolio briefing.
 */
export interface BriefingInput {
  snapshot: PortfolioSnapshot;
  uberEquity: UberEquity[];
  rsuGrants: UberRSUGrant[];
  cashBalanceEurCents: number;
  /** Current month being briefed (YYYY-MM) */
  month: string;
  /** Previous month's briefing summary for context (optional) */
  previousBriefing?: string;
}

/**
 * Zod schema for the briefing response.
 */
export const BriefingResponseSchema = z.object({
  headline: z.string().min(1),
  portfolioSummary: z.string().min(1),
  keyChanges: z.array(z.string()),
  upcomingVestingEvents: z.array(
    z.object({
      date: z.string(),
      shares: z.number().int().positive(),
      estimatedValueUsdCents: z.number().int().nonnegative(),
    }),
  ),
  actionItems: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      item: z.string(),
    }),
  ),
  monthlyOutlook: z.string().min(1),
});

export type BriefingResponse = z.infer<typeof BriefingResponseSchema>;

/**
 * System prompt for monthly briefing generation.
 */
const BRIEFING_SYSTEM_PROMPT = `You are a personal financial assistant generating a concise monthly portfolio briefing.

The user has:
- A DeGiro ETF portfolio (EUR-denominated)
- Uber equity (RSUs, ESPP, Direct Shares) via Morgan Stanley (USD-denominated)
- Monthly DCA strategy into ETFs

Generate a clear, actionable briefing covering:
1. Portfolio overview (total value, allocation)
2. Notable changes since last month
3. Upcoming RSU vesting events
4. Action items for the month (DCA purchases, RSU decisions, rebalancing)
5. Brief outlook

Response format: Return ONLY valid JSON matching the schema. Be concise — the briefing should be readable in 2 minutes.`;

/**
 * Generate a monthly portfolio briefing using Claude.
 *
 * @param input - Portfolio data and context
 * @returns Structured monthly briefing
 *
 * Phase 4 implementation.
 */
export async function generateMonthlyBriefing(input: BriefingInput): Promise<BriefingResponse> {
  // TODO Phase 4: implement
  const client = getAnthropicClient();

  const userPrompt = `Generate a monthly briefing for ${input.month}.

Portfolio snapshot (${input.snapshot.date}):
${JSON.stringify(input.snapshot.holdings, null, 2)}

Uber equity:
${JSON.stringify(input.uberEquity, null, 2)}

Active RSU grants:
${JSON.stringify(input.rsuGrants, null, 2)}

Cash balance: €${(input.cashBalanceEurCents / 100).toFixed(2)}

${input.previousBriefing ? `Previous month summary:\n${input.previousBriefing}` : ''}`;

  const webSearchTool: Anthropic.Tool = {
    name: 'web_search',
    description: 'Search for current ETF prices, market indices, and financial news',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  };

  const message = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 3000,
    system: BRIEFING_SYSTEM_PROMPT,
    tools: [webSearchTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude briefing generator');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return BriefingResponseSchema.parse(parsed);
}
