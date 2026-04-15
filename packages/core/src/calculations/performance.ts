import type { Holding, TransactionHistory } from '../types/index.js';

export interface PositionPnL {
  isin: string;
  name: string;
  exchange: string;
  quantity: number;
  currentValueCents: number;
  /** Average cost basis in cents (total cost / quantity held) */
  costBasisCents: number;
  gainCents: number;
  gainPct: number;
  /** True when no buy transactions exist — cost basis is estimated from current price */
  costBasisEstimated: boolean;
}

/**
 * Compute unrealised P&L for each holding.
 *
 * Matches transactions to holdings by ISIN first, then by asset name as fallback.
 * When no matching transactions exist, marks costBasisEstimated = true and uses
 * the current price as cost basis (gain = 0).
 */
export function computePositionPnL(
  holdings: Holding[],
  transactions: TransactionHistory[],
): PositionPnL[] {
  return holdings.map((holding) => {
    // Match by ISIN first; fall back to name match for legacy records without ISIN
    const matched = transactions.filter(
      (tx) =>
        (tx.isin && tx.isin === holding.isin) ||
        (!tx.isin && tx.asset === holding.name),
    );
    const buys = matched.filter((tx) => tx.action === 'buy');

    if (buys.length === 0) {
      return {
        isin: holding.isin,
        name: holding.name,
        exchange: holding.exchange,
        quantity: holding.quantity,
        currentValueCents: holding.valueCents,
        costBasisCents: holding.valueCents, // no data — assume break-even
        gainCents: 0,
        gainPct: 0,
        costBasisEstimated: true,
      };
    }

    // Total cost = sum(price_per_unit * qty) + fees for all buy transactions
    const totalQtyBought = buys.reduce((s, tx) => s + tx.quantity, 0);
    const totalCostCents = buys.reduce(
      (s, tx) => s + tx.quantity * tx.priceCents + tx.feeCents,
      0,
    );

    // Average cost per unit × currently held quantity
    const avgCostPerUnit = totalQtyBought > 0 ? totalCostCents / totalQtyBought : 0;
    const costBasisCents = Math.round(avgCostPerUnit * holding.quantity);
    const gainCents = holding.valueCents - costBasisCents;
    const gainPct = costBasisCents > 0 ? (gainCents / costBasisCents) * 100 : 0;

    return {
      isin: holding.isin,
      name: holding.name,
      exchange: holding.exchange,
      quantity: holding.quantity,
      currentValueCents: holding.valueCents,
      costBasisCents,
      gainCents,
      gainPct,
      costBasisEstimated: false,
    };
  });
}
