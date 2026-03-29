import { z } from 'zod';
import { getAnthropicClient, DEFAULT_MODEL } from '../client.js';
import type { RebalancingPlan, VestingSchedule, ConcentrationAnalysis } from '@investpilot/core';

/**
 * Types of advisory context for Claude.
 */
export type AdvisoryMode = 'rebalance' | 'rsu' | 'dca' | 'strategy';

/**
 * Input context for rebalancing advice.
 */
export interface RebalancingAdviceInput {
  plan: RebalancingPlan;
  currentMonth: string; // YYYY-MM
  availableFreeTradeIsins: string[];
  cashBalanceEurCents: number;
}

/**
 * Input context for RSU sell/hold advice.
 */
export interface RSUAdviceInput {
  vestingSchedule: VestingSchedule;
  concentration: ConcentrationAnalysis;
  sharesAvailableToSell: number;
  currentUsdPriceCents: number; // Uber stock price in USD cents
}

/**
 * Zod schema for structured advice output.
 */
export const AdviceResponseSchema = z.object({
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  actions: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      action: z.string(),
      rationale: z.string(),
      amountCents: z.number().int().optional(),
    }),
  ),
  risks: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type AdviceResponse = z.infer<typeof AdviceResponseSchema>;

/**
 * System prompt for investment advisory mode.
 */
const ADVISOR_SYSTEM_PROMPT = `You are an expert personal investment advisor for a 2-person household.

Investment principles:
- Long-term passive investing via ETFs (primary strategy)
- Diversification across global markets, with tilt toward developed markets
- Single-stock concentration limit: keep Uber equity below 20% of total portfolio
- Monthly DCA into DeGiro ETFs, using the free-trade allowance efficiently
- RSU strategy: sell promptly after vesting to reduce concentration, unless tax-advantaged holding period applies
- Currency: primarily EUR-denominated portfolio, with USD exposure via Uber equity

Response format: Return ONLY valid JSON matching the schema. No markdown, no explanations outside JSON.

Schema:
{
  "summary": "One-sentence summary of situation",
  "recommendation": "Primary recommendation",
  "actions": [
    {
      "priority": "high|medium|low",
      "action": "Specific action to take",
      "rationale": "Why this action",
      "amountCents": 150000  // optional, in relevant currency cents
    }
  ],
  "risks": ["Optional risk to be aware of"],
  "notes": "Optional additional context"
}`;

/**
 * Generate rebalancing advice using Claude.
 *
 * @param input - Rebalancing plan and context
 * @returns Structured advice response
 *
 * Phase 4 implementation.
 */
export async function generateRebalancingAdvice(
  input: RebalancingAdviceInput,
): Promise<AdviceResponse> {
  // TODO Phase 4: implement
  const client = getAnthropicClient();

  const userPrompt = `Generate rebalancing advice for the following situation:

Rebalancing plan:
${JSON.stringify(input.plan, null, 2)}

Current month: ${input.currentMonth}
Available free trades (ISINs): ${input.availableFreeTradeIsins.join(', ')}
Cash available: €${(input.cashBalanceEurCents / 100).toFixed(2)}

Provide prioritized actions, keeping in mind:
1. Use free trades first (listed above)
2. Only sell if rebalancing truly requires it
3. Keep transaction costs minimal`;

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return AdviceResponseSchema.parse(parsed);
}

/**
 * Generate RSU sell/hold advice using Claude.
 *
 * @param input - RSU vesting schedule and concentration analysis
 * @returns Structured advice response
 *
 * Phase 4 implementation.
 */
export async function generateRSUAdvice(input: RSUAdviceInput): Promise<AdviceResponse> {
  // TODO Phase 4: implement
  const client = getAnthropicClient();

  const userPrompt = `Generate RSU sell/hold advice for the following situation:

Vesting schedule:
${JSON.stringify(input.vestingSchedule, null, 2)}

Concentration analysis:
${JSON.stringify(input.concentration, null, 2)}

Shares available to sell: ${input.sharesAvailableToSell}
Current Uber price: $${(input.currentUsdPriceCents / 100).toFixed(2)}

Provide advice on whether to sell now, hold, or partially sell, considering:
1. Concentration risk (>20% in single stock is over limit)
2. Tax implications (holding period active flag)
3. RSU vesting timing`;

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return AdviceResponseSchema.parse(parsed);
}
