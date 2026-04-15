import { formatEur } from '../../lib/calc.js';

// Dutch Box 3 wealth tax constants for 2026
const BOX3_VRIJSTELLING_CENTS = 11_400_000; // €114,000 couple exemption (2 × €57,000)
const BOX3_DEEMED_RETURN_RATE = 0.0588; // 5.88% fictitious return rate
const BOX3_TAX_RATE = 0.36; // 36% on deemed return

type Props = {
  /** Total portfolio value in EUR cents (ETF + equity converted to EUR) */
  totalPortfolioEurCents: number;
  today?: Date;
};

export function Box3Widget({ totalPortfolioEurCents, today = new Date() }: Props) {
  const month = today.getMonth() + 1; // 1–12
  if (month < 10) return null; // only show Oct–Dec

  const year = today.getFullYear();
  const dec31 = new Date(year, 11, 31); // Dec 31 of current year
  const daysToYearEnd = Math.ceil((dec31.getTime() - today.getTime()) / 86_400_000);

  const taxableWealthCents = Math.max(0, totalPortfolioEurCents - BOX3_VRIJSTELLING_CENTS);
  const estimatedTaxCents = Math.round(
    taxableWealthCents * BOX3_DEEMED_RETURN_RATE * BOX3_TAX_RATE,
  );
  const isExempt = taxableWealthCents === 0;

  return (
    <div className="bg-amber-900/30 border border-amber-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-amber-400 text-xs font-medium uppercase tracking-wide">
          Box 3 Tax Awareness
        </p>
        <span className="text-amber-300 text-xs font-semibold">
          {daysToYearEnd <= 0 ? 'Dec 31 today!' : `${daysToYearEnd}d to Dec 31`}
        </span>
      </div>

      {isExempt ? (
        <p className="text-amber-200 text-sm">
          Portfolio is below the €{(BOX3_VRIJSTELLING_CENTS / 100).toLocaleString()} couple
          exemption — no Box 3 tax due.
        </p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-amber-300/70">Taxable wealth</span>
            <span className="text-amber-200 font-medium">{formatEur(taxableWealthCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-300/70">Deemed return (5.88%)</span>
            <span className="text-amber-200">
              {formatEur(Math.round(taxableWealthCents * BOX3_DEEMED_RETURN_RATE))}
            </span>
          </div>
          <div className="flex justify-between border-t border-amber-700/40 pt-1.5 mt-1.5">
            <span className="text-amber-300 font-medium">Est. Box 3 tax (36%)</span>
            <span className="text-amber-100 font-bold">{formatEur(estimatedTaxCents)}</span>
          </div>
        </div>
      )}

      <p className="text-amber-500 text-xs mt-3">
        Ensure you upload a Dec 31 portfolio snapshot for accurate tax records.
      </p>
    </div>
  );
}
