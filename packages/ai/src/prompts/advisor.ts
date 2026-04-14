import { z } from 'zod';
import { getAnthropicClient, SONNET_MODEL } from '../client.js';
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
 * Input context for DCA cash timing advice.
 */
export interface DCAAdviceInput {
  /** Amount to invest in EUR cents */
  investmentAmountEurCents: number;
  /** Current month YYYY-MM */
  currentMonth: string;
  /** Available free trade ISINs for the month */
  availableFreeTradeIsins: string[];
  /** Current rebalancing plan */
  plan: RebalancingPlan;
  /** Current market note (optional, from briefing) */
  marketNote?: string;
}

/**
 * A single message in a multi-turn advisory chat session.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
 * System prompt for rebalancing commentary mode (no web search needed).
 */
const REBALANCE_SYSTEM_PROMPT = `You are a personal investment advisor narrating a rebalancing trade list.

Investment principles:
- Long-term passive investing via ETFs (primary strategy)
- Single-stock concentration limit: keep Uber equity below 20% of total portfolio
- Monthly DCA into DeGiro ETFs, using the free-trade allowance efficiently
- Sell first (if needed), then buy — to free up cash
- Only sell if rebalancing truly requires it

Response format: Return ONLY valid JSON matching the schema. No markdown, no explanations outside JSON.

Schema:
{
  "summary": "One-sentence summary of situation",
  "recommendation": "Primary recommendation",
  "actions": [
    { "priority": "high|medium|low", "action": "...", "rationale": "...", "amountCents": 150000 }
  ],
  "risks": ["Optional risk"],
  "notes": "Optional context"
}`;

/**
 * System prompt for advisory chat follow-ups.
 */
const CHAT_SYSTEM_PROMPT = `You are InvestPilot, a personal investment advisor for a 2-person household.

You are in a conversational advisory session. The user has received a recommendation and may ask follow-up questions.
Be concise, friendly, and fact-based. You can reference the recommendation in context.

Investment principles:
- Long-term passive investing via globally diversified ETFs
- Uber concentration limit: 20% of total portfolio
- Monthly DCA, use DeGiro free trades efficiently
- RSU strategy: sell to reduce concentration after vesting`;

/**
 * System prompt for DCA cash timing advice.
 */
const DCA_SYSTEM_PROMPT = `You are a personal investment advisor helping with monthly DCA cash deployment.

Response format: Return ONLY valid JSON matching the schema. No markdown outside JSON.

Schema:
{
  "summary": "One-sentence summary",
  "recommendation": "Primary recommendation",
  "actions": [
    { "priority": "high|medium|low", "action": "...", "rationale": "...", "amountCents": 150000 }
  ],
  "notes": "Optional notes about free-trade usage, timing, etc."
}`;

/**
 * Generate rebalancing commentary using Claude Sonnet.
 */
export async function generateRebalancingAdvice(
  input: RebalancingAdviceInput,
): Promise<AdviceResponse> {
  const client = getAnthropicClient();

  const freeIsins =
    input.availableFreeTradeIsins.length > 0
      ? input.availableFreeTradeIsins.join(', ')
      : 'none this month';

  const userPrompt = `Narrate this rebalancing plan for ${input.currentMonth}.

Rebalancing plan:
${JSON.stringify(input.plan, null, 2)}

Free trades available: ${freeIsins}
Cash available: €${(input.cashBalanceEurCents / 100).toFixed(2)}

Provide prioritised actions. Use free trades first. Only sell if truly needed. Keep costs minimal.`;

  const message = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system: REBALANCE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from rebalancing advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return AdviceResponseSchema.parse(parsed);
}

/**
 * Generate RSU sell/hold advice using Claude Sonnet.
 */
export async function generateRSUAdvice(input: RSUAdviceInput): Promise<AdviceResponse> {
  const client = getAnthropicClient();

  const userPrompt = `Generate RSU sell/hold advice.

Vesting schedule:
${JSON.stringify(input.vestingSchedule, null, 2)}

Concentration analysis:
${JSON.stringify(input.concentration, null, 2)}

Shares available to sell: ${input.sharesAvailableToSell}
Current Uber price: $${(input.currentUsdPriceCents / 100).toFixed(2)}

Consider: concentration risk (>20% is over limit), holding period flags, vesting timing.`;

  const message = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system: REBALANCE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from RSU advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return AdviceResponseSchema.parse(parsed);
}

/**
 * Generate DCA monthly investment advice using Claude Sonnet.
 */
export async function generateDCAAdvice(input: DCAAdviceInput): Promise<AdviceResponse> {
  const client = getAnthropicClient();

  const freeIsins =
    input.availableFreeTradeIsins.length > 0
      ? input.availableFreeTradeIsins.join(', ')
      : 'none — this is the first trade of each month per ISIN, so all qualify as free';

  const userPrompt = `Monthly DCA investment for ${input.currentMonth}.

Amount to invest: €${(input.investmentAmountEurCents / 100).toFixed(0)}
Free trade ISINs available: ${freeIsins}
${input.marketNote ? `Market context: ${input.marketNote}` : ''}

Rebalancing plan (what's most underweight):
${input.plan.actions
  .filter((a) => a.action === 'buy')
  .map((a) => `- ${a.etfName} (${a.etfIsin}): needs €${(a.amountEurCents / 100).toFixed(0)} (drift ${a.driftPct.toFixed(1)}%)`)
  .join('\n')}

Generate concrete buy orders. All ETF purchases are free (first trade of month per ISIN on DeGiro). Note this explicitly.`;

  const message = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system: DCA_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from DCA advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return AdviceResponseSchema.parse(parsed);
}

/**
 * Stream a multi-turn advisory chat follow-up response.
 * Yields text chunks as they arrive.
 */
export async function* streamAdvisoryChat(
  messages: ChatMessage[],
  contextSummary: string,
): AsyncGenerator<string> {
  const client = getAnthropicClient();

  const systemWithContext = `${CHAT_SYSTEM_PROMPT}

## Current Advisory Context
${contextSummary}`;

  const stream = await client.messages.stream({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system: systemWithContext,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta' &&
      chunk.delta.text
    ) {
      yield chunk.delta.text;
    }
  }
}
