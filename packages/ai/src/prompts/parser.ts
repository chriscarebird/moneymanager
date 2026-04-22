import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, SONNET_MODEL } from '../client.js';

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

// ── Morgan Stanley types ─────────────────────────────────────────────────────

export const ParsedMSEquitySchema = z.object({
  type: z.enum(['RSU', 'ESPP', 'Direct_Shares']),
  sharesHeld: z.number().int().nonnegative(),
  sharesAvailableToTransact: z.number().int().nonnegative(),
  /** Market value in USD cents e.g. $2,214 → 221400 */
  marketValueUsdCents: z.number().int().nonnegative(),
  holdingPeriodActive: z.boolean().default(false),
});

export type ParsedMSEquity = z.infer<typeof ParsedMSEquitySchema>;

export const ParsedMSHoldingsSchema = z.object({
  equity: z.array(ParsedMSEquitySchema),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export type ParsedMSHoldings = z.infer<typeof ParsedMSHoldingsSchema>;

// ── RSU grant types ──────────────────────────────────────────────────────────

export const ParsedRSUGrantSchema = z.object({
  /** e.g. "U121543" */
  grantId: z.string().min(1),
  /** e.g. 502 */
  totalRsus: z.number().int().positive(),
  /** ISO 8601 or YYYY-MM-DD */
  vestingCommencementDate: z.string(),
  /** e.g. "3/48 at month 3, then 1/48 monthly" */
  vestingFormula: z.string(),
  /** ISO 8601 or YYYY-MM-DD */
  dateOfGrant: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export type ParsedRSUGrant = z.infer<typeof ParsedRSUGrantSchema>;

// ── System prompts ───────────────────────────────────────────────────────────

const DEGIRO_PARSER_SYSTEM_PROMPT = `You are a financial data extraction assistant. You will be given a screenshot of a DeGiro portfolio (Dutch locale).

The table columns are: Product, Symbool/ISIN, Aantal (quantity), Koers (price), Valuta (currency), Waarde (value in EUR).

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

const MS_HOLDINGS_SYSTEM_PROMPT = `You are a financial data extraction assistant. You will be given a screenshot from Morgan Stanley showing share holdings.

Extract the equity positions from the "Transaction View of Share Holdings" table.

Column mapping:
- Plan Name → type: map "RSU" to "RSU", "ESPP" to "ESPP", anything else with "Direct" to "Direct_Shares"
- Total Shares → sharesHeld (integer)
- Available to Transact → sharesAvailableToTransact (integer)
- Market Value → marketValueUsdCents (USD cents integer): $2,214.00 → 221400
- holdingPeriodActive: true if there is an active holding period restriction, otherwise false

Return ONLY valid JSON matching the schema — no markdown, no explanations.

Response format:
{
  "equity": [
    {
      "type": "RSU",
      "sharesHeld": 150,
      "sharesAvailableToTransact": 120,
      "marketValueUsdCents": 221400,
      "holdingPeriodActive": false
    }
  ],
  "confidence": 0.95,
  "notes": "Optional: any caveats"
}`;

const RSU_GRANT_SYSTEM_PROMPT = `You are a financial document extraction assistant. You will be given an Uber RSU grant agreement (PDF or image).

Extract the following grant parameters:
- grantId: the grant identifier (e.g. "U121543")
- totalRsus: total number of RSUs granted (integer)
- vestingCommencementDate: the date vesting begins (as YYYY-MM-DD)
- vestingFormula: the vesting schedule, normalized to format "3/48 at month 3, then 1/48 monthly"
- dateOfGrant: the grant date (as YYYY-MM-DD), if present

For the vestingFormula, look for cliff vesting (e.g. "3/48 vest at 3 months") followed by monthly vesting (e.g. "1/48 per month").
Normalize to: "<cliff_numerator>/<denominator> at month <cliff_month>, then 1/<denominator> monthly"
Example: if 3/48 vests at month 3 and then 1/48 monthly → "3/48 at month 3, then 1/48 monthly"

Return ONLY valid JSON matching the schema — no markdown, no explanations.

Response format:
{
  "grantId": "U121543",
  "totalRsus": 502,
  "vestingCommencementDate": "2024-11-16",
  "vestingFormula": "3/48 at month 3, then 1/48 monthly",
  "dateOfGrant": "2024-10-01",
  "confidence": 0.95,
  "notes": "Optional: any caveats"
}`;

// ── Date normalization helper ─────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Normalize various date formats to ISO 8601 UTC string.
 * Handles: "16-Nov-2024", "November 16, 2024", "2024-11-16", "11/16/2024"
 * Output: "2024-11-16T00:00:00.000Z"
 */
export function normalizeToISO8601(dateStr: string): string {
  const trimmed = dateStr.trim();

  // Already ISO 8601 with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }

  // DD-Mon-YYYY (e.g. "16-Nov-2024")
  const ddMonYYYY = trimmed.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (ddMonYYYY) {
    const [, day, mon, year] = ddMonYYYY;
    const month = MONTH_MAP[(mon ?? '').toLowerCase()];
    if (month) {
      return new Date(
        `${year}-${month}-${(day ?? '').padStart(2, '0')}T00:00:00.000Z`,
      ).toISOString();
    }
  }

  // Month DD, YYYY (e.g. "November 16, 2024")
  const monthDDYYYY = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDDYYYY) {
    const [, mon, day, year] = monthDDYYYY;
    const month = MONTH_MAP[(mon ?? '').toLowerCase()];
    if (month) {
      return new Date(
        `${year}-${month}-${(day ?? '').padStart(2, '0')}T00:00:00.000Z`,
      ).toISOString();
    }
  }

  // MM/DD/YYYY
  const mmDDYYYY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmDDYYYY) {
    const mm = (mmDDYYYY[1] ?? '').padStart(2, '0');
    const dd = (mmDDYYYY[2] ?? '').padStart(2, '0');
    const yyyy = mmDDYYYY[3] ?? '';
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`).toISOString();
  }

  // Fallback: let Date parse it
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  throw new Error(`Unable to parse date: "${dateStr}"`);
}

/**
 * Normalize vestingFormula to standard format "3/48 at month 3, then 1/48 monthly"
 * if Claude extracts something similar but differently formatted.
 */
function normalizeVestingFormula(formula: string): string {
  // Already in the correct format
  if (/^\d+\/\d+ at month \d+, then 1\/\d+ monthly$/i.test(formula.trim())) {
    return formula.trim();
  }
  // Return as-is if we can't normalize — parseVestingFormula in core will validate
  return formula.trim();
}

// ── JSON extraction helper ────────────────────────────────────────────────────

/** Strip markdown code fences if Claude wraps its JSON response in them. */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

// ── Parser functions ──────────────────────────────────────────────────────────

/**
 * Parse a DeGiro portfolio screenshot using Claude's vision capability.
 *
 * The result must be confirmed by the user before being saved to the database.
 * Never auto-save parsed data — always show it for review first.
 *
 * @param imageBase64 - Base64-encoded image data
 * @param mediaType - Image media type (jpeg/png/gif/webp)
 * @returns Parsed portfolio data for user confirmation
 *
 * @example
 * const parsed = await parseDeGiroScreenshot(base64, 'image/png');
 * // Show to user for confirmation, then POST to /api/portfolio/snapshots
 */
export async function parseDeGiroScreenshot(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<ParsedPortfolio> {
  const client = getAnthropicClient();

  const message = await client.beta.promptCaching.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: DEGIRO_PARSER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
            text: 'Please extract all portfolio holdings from this DeGiro screenshot.',
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude parser');
  }

  const parsed: unknown = JSON.parse(extractJSON(textContent.text));
  return ParsedPortfolioSchema.parse(parsed);
}

// Backward compat alias
export const parsePortfolioScreenshot = parseDeGiroScreenshot;

/**
 * Parse a Morgan Stanley share holdings screenshot using Claude's vision capability.
 *
 * The result must be confirmed by the user before being saved to the database.
 *
 * @param imageBase64 - Base64-encoded image data
 * @param mediaType - Image media type (jpeg/png/gif/webp)
 * @returns Parsed MS holdings data for user confirmation
 */
export async function parseMorganStanleyScreenshot(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<ParsedMSHoldings> {
  const client = getAnthropicClient();

  const message = await client.beta.promptCaching.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: MS_HOLDINGS_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
            text: 'Please extract all equity positions from this Morgan Stanley holdings screenshot.',
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude parser');
  }

  const parsed: unknown = JSON.parse(extractJSON(textContent.text));
  return ParsedMSHoldingsSchema.parse(parsed);
}

/**
 * Parse an RSU grant PDF or image document using Claude.
 *
 * The result must be confirmed by the user before being saved to the database.
 *
 * @param documentBase64 - Base64-encoded document data
 * @param mediaType - Document media type (application/pdf, image/jpeg, image/png)
 * @returns Parsed RSU grant data for user confirmation
 */
export async function parseRSUGrantDocument(
  documentBase64: string,
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png',
): Promise<ParsedRSUGrant> {
  const client = getAnthropicClient();

  const userInstruction = {
    type: 'text' as const,
    text: 'Please extract the RSU grant parameters from this document.',
  };

  let responseText: string;

  if (mediaType === 'application/pdf') {
    const pdfBlock: Anthropic.Beta.BetaBase64PDFBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: documentBase64,
      },
    };
    const betaMessage = await client.beta.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2048,
      system: RSU_GRANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [pdfBlock, userInstruction] }],
      betas: ['pdfs-2024-09-25'],
    });
    const textBlock = betaMessage.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude parser');
    }
    responseText = textBlock.text;
  } else {
    const imageBlock: Anthropic.ImageBlockParam = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: documentBase64,
      },
    };
    const message = await client.beta.promptCaching.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: RSU_GRANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [imageBlock, userInstruction] }],
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude parser');
    }
    responseText = textBlock.text;
  }

  const parsed: unknown = JSON.parse(extractJSON(responseText));
  const result = ParsedRSUGrantSchema.parse(parsed);

  // Normalize dates to ISO 8601
  const normalized: ParsedRSUGrant = {
    ...result,
    vestingCommencementDate: normalizeToISO8601(result.vestingCommencementDate),
    dateOfGrant: result.dateOfGrant ? normalizeToISO8601(result.dateOfGrant) : undefined,
    vestingFormula: normalizeVestingFormula(result.vestingFormula),
  };

  return normalized;
}
