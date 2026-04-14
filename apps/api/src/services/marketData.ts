/**
 * Market data service — Phase 2B.
 * Fetches live prices from Yahoo Finance (unofficial v8 API) and Frankfurter (ECB FX rates).
 * All prices returned in integer cents.
 */

/** ISIN → Yahoo Finance ticker symbol for the reference portfolio ETFs */
export const ISIN_TO_TICKER: Record<string, string> = {
  // DeGiro reference portfolio (Euronext Amsterdam / XETRA)
  'IE00B3RBWM25': 'VWRL.AS',   // Vanguard FTSE All-World
  'IE00B3XXRP09': 'VUSA.AS',   // Vanguard S&P 500
  'IE00BF4RFH31': 'IUSN.DE',   // iShares MSCI World Small Cap
  'IE00BG47KB92': 'VAGE.AS',   // Vanguard Global Aggregate Bond
  'IE00B0M62Y33': 'IAEX.AS',   // iShares AEX
  'IE0032077012': 'EQQQ.AS',   // Invesco EQQQ NASDAQ-100
  'LU3047998896': 'BJL8.DE',   // BNPPE Bloomberg Europe Defensive
  // Uber
  'UBER':         'UBER',       // convenience key for direct lookup
};

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const FRANKFURTER_BASE = 'https://api.frankfurter.app';

// Simple in-memory cache (TTL 5 minutes)
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function toCache<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Fetch Uber stock price from Yahoo Finance.
 * Returns price in USD cents, or null if unavailable.
 */
export async function fetchUberPrice(): Promise<number | null> {
  const cached = fromCache<number>('uber_price');
  if (cached !== null) return cached;

  try {
    const url = `${YAHOO_BASE}/v8/finance/chart/UBER?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price !== 'number') return null;

    const cents = Math.round(price * 100);
    toCache('uber_price', cents);
    return cents;
  } catch {
    return null;
  }
}

/**
 * Fetch USD/EUR exchange rate from Frankfurter (ECB data, free, no key).
 * Returns rate as float (e.g. 0.9234), or null if unavailable.
 */
export async function fetchUsdEurRate(): Promise<number | null> {
  const cached = fromCache<number>('fx_usd_eur');
  if (cached !== null) return cached;

  try {
    const url = `${FRANKFURTER_BASE}/latest?from=USD&to=EUR`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const json = await res.json() as { rates?: { EUR?: number } };
    const rate = json.rates?.EUR;
    if (typeof rate !== 'number') return null;

    toCache('fx_usd_eur', rate, 15 * 60 * 1000); // cache 15 min
    return rate;
  } catch {
    return null;
  }
}

/**
 * Fetch prices for a list of ISINs using Yahoo Finance v7 quote API.
 * Returns a map of ISIN → price in EUR cents (converting via live FX if needed).
 * ISINs not in the mapping are silently skipped.
 */
export async function fetchTickerPrices(
  isins: string[],
): Promise<Record<string, number>> {
  if (isins.length === 0) return {};

  // Map ISINs to Yahoo tickers
  const pairs: Array<{ isin: string; ticker: string }> = isins
    .map((isin) => ({ isin, ticker: ISIN_TO_TICKER[isin] }))
    .filter((p): p is { isin: string; ticker: string } => p.ticker !== undefined);

  if (pairs.length === 0) return {};

  const cacheKey = `etf_prices_${pairs.map((p) => p.ticker).sort().join(',')}`;
  const cached = fromCache<Record<string, number>>(cacheKey);
  if (cached !== null) return cached;

  try {
    const symbols = pairs.map((p) => p.ticker).join(',');
    const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};

    const json = await res.json() as {
      quoteResponse?: {
        result?: Array<{ symbol: string; regularMarketPrice?: number; currency?: string }>;
      };
    };
    const results = json.quoteResponse?.result ?? [];

    const fxRate = (await fetchUsdEurRate()) ?? 0.92;
    const out: Record<string, number> = {};

    for (const pair of pairs) {
      const quote = results.find((r) => r.symbol === pair.ticker);
      if (!quote?.regularMarketPrice) continue;

      let priceCents = Math.round(quote.regularMarketPrice * 100);
      // Convert USD prices to EUR
      if (quote.currency === 'USD') {
        priceCents = Math.round(priceCents * fxRate);
      }
      out[pair.isin] = priceCents;
    }

    toCache(cacheKey, out);
    return out;
  } catch {
    return {};
  }
}

/**
 * Estimate current portfolio value by applying live prices to the last snapshot.
 * Returns null if no prices are available.
 */
export interface PortfolioEstimate {
  totalEurCents: number;
  holdingsUpdated: Array<{ isin: string; quantity: number; livePriceCents: number; valueEurCents: number }>;
  snapshotDate: string;
  pricesAt: string;
  itemsWithLivePrice: number;
  itemsUsingSnapshotPrice: number;
}

export async function estimatePortfolioValue(
  snapshotHoldings: Array<{ isin: string; quantity: number; priceCents: number }>,
  snapshotDate: string,
): Promise<PortfolioEstimate> {
  const isins = snapshotHoldings.map((h) => h.isin);
  const livePrices = await fetchTickerPrices(isins);

  let itemsWithLivePrice = 0;
  let itemsUsingSnapshotPrice = 0;
  let totalEurCents = 0;
  const holdingsUpdated: PortfolioEstimate['holdingsUpdated'] = [];

  for (const holding of snapshotHoldings) {
    const livePriceCents = livePrices[holding.isin];
    const priceCents = livePriceCents ?? holding.priceCents;
    const valueEurCents = holding.quantity * priceCents;

    if (livePriceCents !== undefined) {
      itemsWithLivePrice++;
    } else {
      itemsUsingSnapshotPrice++;
    }

    totalEurCents += valueEurCents;
    holdingsUpdated.push({ isin: holding.isin, quantity: holding.quantity, livePriceCents: priceCents, valueEurCents });
  }

  return {
    totalEurCents,
    holdingsUpdated,
    snapshotDate,
    pricesAt: new Date().toISOString(),
    itemsWithLivePrice,
    itemsUsingSnapshotPrice,
  };
}
