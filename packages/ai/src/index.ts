// Client
export { getAnthropicClient, DEFAULT_MODEL, VISION_MODEL } from './client.js';

// Screenshot parser
export type { ParsedHolding, ParsedPortfolio } from './prompts/parser.js';
export { ParsedHoldingSchema, ParsedPortfolioSchema, parsePortfolioScreenshot } from './prompts/parser.js';

// Investment advisor
export type { AdvisoryMode, RebalancingAdviceInput, RSUAdviceInput, AdviceResponse } from './prompts/advisor.js';
export {
  AdviceResponseSchema,
  generateRebalancingAdvice,
  generateRSUAdvice,
} from './prompts/advisor.js';

// Monthly briefing
export type { BriefingInput, BriefingResponse } from './prompts/briefing.js';
export { BriefingResponseSchema, generateMonthlyBriefing } from './prompts/briefing.js';
