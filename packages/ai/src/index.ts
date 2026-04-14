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

// Investment advisor (rebalance commentator + RSU + DCA + streaming chat)
export type {
  AdvisoryMode,
  RebalancingAdviceInput,
  RSUAdviceInput,
  DCAAdviceInput,
  ChatMessage,
  AdviceResponse,
} from './prompts/advisor.js';
export {
  AdviceResponseSchema,
  generateRebalancingAdvice,
  generateRSUAdvice,
  generateDCAAdvice,
  streamAdvisoryChat,
} from './prompts/advisor.js';

// Strategy advisor (Opus + web search, quarterly review)
export type { StrategyAdviceInput, StrategyAdvice } from './prompts/strategy.js';
export { StrategyAdviceSchema, generateStrategyAdvice } from './prompts/strategy.js';

// Uber equity advisor (Sonnet + web search, trading window)
export type { UberSellAdviceInput, UberSellAdvice } from './prompts/uberAdvisor.js';
export { UberSellAdviceSchema, generateUberSellAdvice } from './prompts/uberAdvisor.js';

// Monthly briefing
export type { BriefingInput, BriefingResponse } from './prompts/briefing.js';
export { BriefingResponseSchema, generateMonthlyBriefing } from './prompts/briefing.js';
