import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, OPUS_MODEL } from '../client.js';
import type {
  PortfolioSnapshot,
  UberEquity,
  UberRSUGrant,
  TargetAllocation,
  CashBalance,
  RebalancingPlan,
  VestingSchedule,
  ConcentrationAnalysis,
} from '@investpilot/core';

export interface StrategyAdviceInput {
  snapshot: PortfolioSnapshot;
  uberEquity: UberEquity[];
  rsuGrants: UberRSUGrant[];
  targets: TargetAllocation[];
  cashBalance: CashBalance | null;
  rebalancingPlan: RebalancingPlan;
  vestingSchedule: VestingSchedule;
  concentration: ConcentrationAnalysis;
  /** Current USD/EUR FX rate (e.g. 0.92) */
  fxRate: number;
  /** Optional: current Uber price in USD cents */
  uberPriceUsdCents?: number;
}

export const StrategyAdviceSchema = z.object({
  headline: z.string().min(1),
  portfolioHealthScore: z.number().min(0).max(10),
  sections: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  ),
  priorityActions: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      category: z.enum(['rebalance', 'rsu', 'dca', 'risk', 'tax', 'other']),
      action: z.string(),
      rationale: z.string(),
      amountCents: z.number().int().optional(),
    }),
  ),
  marketContext: z.string().optional(),
  nextReviewDate: z.string().optional(),
  timestamp: z.string(),
  pricesUsed: z.object({
    uberUsdCents: z.number().int().optional(),
    fxRate: z.number(),
    snapshotDate: z.string(),
  }),
});

export type StrategyAdvice = z.infer<typeof StrategyAdviceSchema>;

const STRATEGY_SYSTEM_PROMPT = `You are a personal investment advisor for a 2-person household using InvestPilot.

Investment principles:
- Long-term passive investing via globally diversified ETFs (primary strategy, ~80% of portfolio)
- Single-stock concentration limit: Uber equity must stay below 20% of total portfolio
- Monthly DCA into DeGiro ETFs using the free-trade allowance efficiently
- RSU strategy: sell promptly after vesting to reduce concentration, unless a tax-advantaged holding period applies
- Portfolio currency: primarily EUR-denominated, with USD exposure via Uber equity
- Box 3 consideration (Dutch wealth tax): be aware of Dec 31 snapshot date

Quarterly review focus:
1. Portfolio health: concentration, drift from targets, overall allocation quality
2. Uber equity: concentration risk, upcoming vests, selling urgency
3. Rebalancing: which positions need attention, cost-efficient way to rebalance
4. Market context: is this a good time to DCA more aggressively or hold back?
5. Tax efficiency: any year-end considerations (Box 3, ESPP holding periods)

Response format: Return ONLY valid JSON matching the schema. No markdown or prose outside JSON.

Schema:
{
  "headline": "One-line portfolio health summary",
  "portfolioHealthScore": 7.5,
  "sections": [
    { "title": "Portfolio Overview", "content": "..." },
    { "title": "Uber Concentration", "content": "..." },
    { "title": "Rebalancing Status", "content": "..." },
    { "title": "Market Context", "content": "..." }
  ],
  "priorityActions": [
    { "priority": "high", "category": "rsu", "action": "...", "rationale": "...", "amountCents": 150000 }
  ],
  "marketContext": "Brief current market summary",
  "nextReviewDate": "2026-07-01",
  "timestamp": "2026-03-30T09:00:00Z",
  "pricesUsed": { "uberUsdCents": 6921, "fxRate": 0.92, "snapshotDate": "2026-03-01" }
}`;

function buildStrategyUserPrompt(input: StrategyAdviceInput): string {
  const etfTotal = input.snapshot.holdings.reduce((s, h) => s + h.valueCents, 0);
  const uberUsd = input.uberEquity.reduce((s, e) => s + e.marketValueUsdCents, 0);
  const uberEur = Math.round(uberUsd * input.fxRate);
  const totalEur = etfTotal + uberEur;

  return `Perform a quarterly portfolio review as of ${new Date().toISOString().slice(0, 10)}.

## Portfolio Summary
- Total portfolio: €${(totalEur / 100).toFixed(0)}
- DeGiro ETFs: €${(etfTotal / 100).toFixed(0)}
- Uber equity (USD→EUR @ ${input.fxRate}): €${(uberEur / 100).toFixed(0)}
- Uber concentration: ${input.concentration.uberConcentrationPct.toFixed(1)}% (limit: 20%)
- Cash available: €${((input.cashBalance?.amountCents ?? 0) / 100).toFixed(0)}

## ETF Holdings
${input.snapshot.holdings.map((h) => `- ${h.name} (${h.isin}): ${h.quantity} shares @ €${(h.priceCents / 100).toFixed(2)} = €${(h.valueCents / 100).toFixed(0)}`).join('\n')}

## Uber Equity
${input.uberEquity.map((e) => `- ${e.type}: ${e.sharesHeld} held (${e.sharesAvailableToTransact} available) = $${(e.marketValueUsdCents / 100).toFixed(0)}`).join('\n')}
${input.uberPriceUsdCents ? `- Current Uber price: $${(input.uberPriceUsdCents / 100).toFixed(2)}` : ''}

## Active RSU Grants
${input.rsuGrants.filter((g) => g.status === 'active').map((g) => `- Grant ${g.grantId}: ${g.totalRsus} total RSUs, vesting from ${g.vestingCommencementDate}, formula: ${g.vestingFormula}`).join('\n')}

## Next Vesting Events
${input.vestingSchedule.events.slice(0, 5).map((e) => `- ${e.date}: ${e.sharesVesting} shares`).join('\n')}

## Target Allocations vs Actual
${input.targets.filter((t) => t.active).map((t) => {
    const holding = input.snapshot.holdings.find((h) => h.isin === t.etfIsin);
    const actual = holding ? (holding.valueCents / etfTotal) * 100 : 0;
    const drift = actual - t.targetPct;
    return `- ${t.etfName} (${t.etfIsin}): target ${t.targetPct}%, actual ${actual.toFixed(1)}%, drift ${drift > 0 ? '+' : ''}${drift.toFixed(1)}%`;
  }).join('\n')}

## Rebalancing Plan
- Rebalancing recommended: ${input.rebalancingPlan.rebalancingRecommended}
- Max drift: ${input.rebalancingPlan.maxDriftPct.toFixed(1)}%
- Deployable cash: €${(input.rebalancingPlan.availableCashEurCents / 100).toFixed(0)}
${input.rebalancingPlan.actions.filter((a) => a.action !== 'hold').map((a) => `- ${a.action.toUpperCase()} ${a.etfName}: €${Math.abs(a.amountEurCents) / 100}`).join('\n')}

Please search for current market context (MSCI World, S&P 500, FTSE All-World performance this quarter, Uber stock recent performance) and factor it into your recommendation.`;
}

export async function generateStrategyAdvice(input: StrategyAdviceInput): Promise<StrategyAdvice> {
  const client = getAnthropicClient();

  const webSearchTool: Anthropic.Tool = {
    name: 'web_search',
    description: 'Search for current financial market data, stock prices, and investment news',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  };

  const message = await client.messages.create({
    model: OPUS_MODEL,
    max_tokens: 4096,
    system: STRATEGY_SYSTEM_PROMPT,
    tools: [webSearchTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: buildStrategyUserPrompt(input) }],
  });

  // Extract text from final response (after any tool use)
  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from strategy advisor');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return StrategyAdviceSchema.parse(parsed);
}
