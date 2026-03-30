// Client
export {
  getAnthropicClient,
  DEFAULT_MODEL,
  VISION_MODEL,
  SONNET_MODEL,
  OPUS_MODEL,
} from './client.js';

// Screenshot parser
export type {
  ParsedHolding,
  ParsedPortfolio,
  ParsedMSEquity,
  ParsedMSHoldings,
  ParsedRSUGrant,
} from './prompts/parser.js';
export {
  ParsedHoldingSchema,
  ParsedPortfolioSchema,
  ParsedMSEquitySchema,
  ParsedMSHoldingsSchema,
  ParsedRSUGrantSchema,
  parsePortfolioScreenshot,
  parseDeGiroScreenshot,
  parseMorganStanleyScreenshot,
  parseRSUGrantDocument,
  normalizeToISO8601,
} from './prompts/parser.js';

// Investment advisor
export type {
  AdvisoryMode,
  RebalancingAdviceInput,
  RSUAdviceInput,
  AdviceResponse,
} from './prompts/advisor.js';
export {
  AdviceResponseSchema,
  generateRebalancingAdvice,
  generateRSUAdvice,
} from './prompts/advisor.js';

// Monthly briefing
export type { BriefingInput, BriefingResponse } from './prompts/briefing.js';
export { BriefingResponseSchema, generateMonthlyBriefing } from './prompts/briefing.js';
