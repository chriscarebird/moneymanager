import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, VISION_MODEL } from '../client.js';

/**
 * Zod schema for a parsed holding from a portfolio screenshot.
 * Used for runtime validation of Claude's response.
 */
export const ParsedHoldingSchema = z.object({
  name: z.string().min(1),
  isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'Invalid ISIN format'),
  assetType: z.enum(['ETF', 'Stock']),
  quantity: z.number().int().positive(),
  /** Price per share in EUR cents */
  priceCents: z.number().int().nonnegative(),
  /** Total value in EUR cents */
  valueCents: z.number().int().nonnegative(),
  exchange: z.string().default(''),
});

export type ParsedHolding = z.infer<typeof ParsedHoldingSchema>;

export const ParsedPortfolioSchema = z.object({
  holdings: z.array(ParsedHoldingSchema),
  /** Optional: total portfolio value extracted from screenshot (EUR cents) */
  totalValueCents: z.number().int().nonnegative().optional(),
  /** Confidence score 0–1 from the parsing */
  confidence: z.number().min(0).max(1).optional(),
  /** Any notes or warnings from the parser */
  notes: z.string().optional(),
});

export type ParsedPortfolio = z.infer<typeof ParsedPortfolioSchema>;

/**
 * System prompt for portfolio screenshot parsing.
 */
const PARSER_SYSTEM_PROMPT = `You are a financial data extraction assistant. You will be given a screenshot of a portfolio (typically from DeGiro or a similar broker).

Extract all holdings from the screenshot and return them as structured JSON.

Rules:
- Extract every visible holding (ETF or stock)
- ISIN format: 2 letter country code + 9 alphanumeric + 1 check digit (e.g. IE00B3RBWM25)
- All money values must be in EUR cents (integer): €137.28 → 13728
- Quantities must be whole numbers (integer shares)
- assetType: use "ETF" for ETFs/index funds, "Stock" for individual company stocks
- If a value is unclear or missing, omit it rather than guessing
- Return ONLY valid JSON matching the schema — no markdown, no explanations

Response format:
{
  "holdings": [
    {
      "name": "Full ETF/stock name",
      "isin": "IE00B3RBWM25",
      "assetType": "ETF",
      "quantity": 112,
      "priceCents": 13728,
      "valueCents": 1537500,
      "exchange": "XETRA"
    }
  ],
  "totalValueCents": 2430000,
  "confidence": 0.95,
  "notes": "Optional: any caveats about the extraction"
}`;

/**
 * Parse a portfolio screenshot using Claude's vision capability.
 *
 * The result must be confirmed by the user before being saved to the database.
 * Never auto-save parsed data — always show it for review first.
 *
 * @param imageBase64 - Base64-encoded image data
 * @param mediaType - Image media type (jpeg/png/gif/webp)
 * @returns Parsed portfolio data for user confirmation
 *
 * @example
 * const parsed = await parsePortfolioScreenshot(base64, 'image/png');
 * // Show to user for confirmation, then POST to /api/portfolio/snapshots
 */
export async function parsePortfolioScreenshot(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<ParsedPortfolio> {
  // TODO Phase 4: implement
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    system: PARSER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          } as Anthropic.ImageBlockParam,
          {
            type: 'text',
            text: 'Please extract all portfolio holdings from this screenshot.',
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude parser');
  }

  const parsed: unknown = JSON.parse(textContent.text);
  return ParsedPortfolioSchema.parse(parsed);
}
