import { z } from 'zod';
import { getAnthropicClient, SONNET_MODEL } from '../client.js';
import { extractJSON } from '../json.js';
import type {
  UberEquity,
  UberRSUGrant,
  PortfolioSnapshot,
  ConcentrationAnalysis,
} from '@investpilot/core';

export interface UberSellAdviceInput {
  snapshot: PortfolioSnapshot;
  uberEquity: UberEquity[];
  rsuGrants: UberRSUGrant[];
  concentration: ConcentrationAnalysis;
  /** Current Uber stock price in USD cents */
  uberPriceUsdCents: number;
  /** Current USD/EUR FX rate */
  fxRate: number;
  /** Whether we're within 6 weeks of Dec 31 (Box 3 consideration) */
  nearYearEnd: boolean;
}

export const UberSellAdviceSchema = z.object({
  headline: z.string(),
  currentConcentrationPct: z.number(),
  targetConcentrationPct: z.number(),
  recommendation: z.object({
    action: z.enum(['sell_now', 'sell_partial', 'hold', 'no_available_shares']),
    sharesToSell: z.number().int().nonnegative(),
    equityTypeToSell: z.enum(['RSU', 'ESPP', 'Direct_Shares', 'mixed']).optional(),
    proceedsUsdCents: z.number().int().nonnegative(),
    proceedsEurCents: z.number().int().nonnegative(),
    rationale: z.string(),
    taxNote: z.string().optional(),
  }),
  marketContext: z.object({
    uberPriceUsd: z.number(),
    priceAssessment: z.string(), // "favorable", "unfavorable", "neutral"
    fxNote: z.string().optional(),
    analystSentiment: z.string().optional(),
    upcomingEvents: z.string().optional(),
  }),
  box3Warning: z.string().optional(),
  afterSellPlan: z.string(),
  timestamp: z.string(),
});

export type UberSellAdvice = z.infer<typeof UberSellAdviceSchema>;

const UBER_ADVISOR_SYSTEM_PROMPT = `You are a specialist Uber equity advisor for a long-term ETF investor.

Context:
- The user holds Uber equity (RSUs, ESPP, Direct Shares) via Morgan Stanley
- Uber concentration must stay below 20% of total portfolio value
- Sell priority: prefer ESPP or Direct_Shares first (often more tax-efficient or no vesting lock-up)
- RSUs that have vested and are available should be sold to reduce concentration
- Box 3 consideration: Dutch wealth tax snapshots on Dec 31 — selling before Dec 31 removes value from Box 3 calculation

Response format: Return ONLY valid JSON matching the schema. No markdown outside JSON.

When assessing whether to sell:
1. Check if concentration is above 20% (the hard limit)
2. Check if above 25% (high urgency) or above 35% (critical)
3. Calculate exactly how many shares to sell to reach 20%
4. Recommend which equity type to sell (prefer most tax-efficient)
5. Factor in current price vs 30-day trend and analyst sentiment`;

function buildUberUserPrompt(input: UberSellAdviceInput): string {
  const etfTotal = input.snapshot.holdings.reduce((s, h) => s + h.valueCents, 0);
  const uberAvailableShares = input.uberEquity.reduce(
    (s, e) => s + e.sharesAvailableToTransact,
    0,
  );
  const today = new Date().toISOString().slice(0, 10);

  return `Trading window is open. Provide Uber sell recommendation as of ${today}.

## Current Portfolio
- DeGiro ETFs total: €${(etfTotal / 100).toFixed(0)}
- Uber equity (all types):
${input.uberEquity.map((e) => `  - ${e.type}: ${e.sharesHeld} held, ${e.sharesAvailableToTransact} available to sell = $${(e.marketValueUsdCents / 100).toFixed(0)}`).join('\n')}

## Concentration Analysis
- Current Uber concentration: ${input.concentration.uberConcentrationPct.toFixed(1)}%
- Concentration limit: 20%
- Suggested sell to reach limit: $${(input.concentration.suggestedSellUsdCents / 100).toFixed(0)}

## Pricing
- Current Uber price: $${(input.uberPriceUsdCents / 100).toFixed(2)}
- USD/EUR FX rate: ${input.fxRate}
- Shares available to sell: ${uberAvailableShares} total
${input.nearYearEnd ? '- ⚠️ Within 6 weeks of Dec 31 — Box 3 tax consideration applies' : ''}

## Active Grants (for context)
${input.rsuGrants.filter((g) => g.status === 'active').map((g) => `- Grant ${g.grantId}: ${g.totalRsus} RSUs from ${g.vestingCommencementDate}`).join('\n')}

Use your knowledge of Uber's recent stock performance, analyst consensus, and USD/EUR trends to inform your recommendation. Note where data may be approximate.`;
}

export async function generateUberSellAdvice(input: UberSellAdviceInput): Promise<UberSellAdvice> {
  const client = getAnthropicClient();

  const message = await client.beta.promptCaching.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: UBER_ADVISOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUberUserPrompt(input) }],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Uber advisor');
  }

  const parsed: unknown = JSON.parse(extractJSON(textContent.text));
  return UberSellAdviceSchema.parse(parsed);
}
