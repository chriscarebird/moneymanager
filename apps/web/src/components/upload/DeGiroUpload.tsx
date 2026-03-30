import { useState, type ChangeEvent } from 'react';
import { StatusMessage } from './StatusMessage.js';

type ParsedHolding = {
  name: string;
  isin: string;
  assetType: 'ETF' | 'Stock';
  quantity: number;
  priceCents: number;
  valueCents: number;
  exchange: string;
};

type ParsedPortfolio = {
  holdings: ParsedHolding[];
  totalValueCents?: number;
  confidence?: number;
  notes?: string;
};

function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DeGiroUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState<ParsedPortfolio | null>(null);
  const [holdings, setHoldings] = useState<ParsedHolding[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setMessage('Parsing screenshot with Claude...');
    setParsed(null);

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

      const res = await fetch('/api/uploads/degiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
        credentials: 'include',
      });
      const json = (await res.json()) as { data: ParsedPortfolio | null; error: string | null };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Parse failed');
      }
      const result = json.data!;
      setParsed(result);
      setHoldings(result.holdings);
      setStatus('success');
      setMessage(`Parsed ${result.holdings.length} holdings. Review and confirm below.`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to parse screenshot');
    }
  }

  async function handleConfirm() {
    if (!parsed) return;
    setSaving(true);
    setMessage('Saving to database...');

    try {
      const res = await fetch('/api/portfolio/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString(),
          source: 'screenshot',
          holdings,
        }),
        credentials: 'include',
      });
      const json = (await res.json()) as { data: { id: string } | null; error: string | null };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Save failed');
      }
      setStatus('success');
      setMessage('Portfolio snapshot saved successfully.');
      setParsed(null);
      setHoldings([]);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function updateHolding(index: number, field: keyof ParsedHolding, value: string | number) {
    setHoldings((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          DeGiro Portfolio Screenshot
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={status === 'loading'}
          className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 disabled:opacity-50"
        />
      </div>

      <StatusMessage status={status} message={message} />

      {parsed && holdings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">
            Review parsed holdings — edit any values before confirming
          </h3>
          {parsed.confidence !== undefined && (
            <p className="text-xs text-slate-500">
              Parser confidence: {Math.round(parsed.confidence * 100)}%
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">ISIN</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Qty</th>
                  <th className="pb-2 pr-3">Price</th>
                  <th className="pb-2">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {holdings.map((h, i) => (
                  <tr key={i} className="py-1">
                    <td className="py-1 pr-3">
                      <input
                        value={h.name}
                        onChange={(e) => updateHolding(i, 'name', e.target.value)}
                        className="bg-slate-700 rounded px-1 py-0.5 w-32 text-white text-xs"
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        value={h.isin}
                        onChange={(e) => updateHolding(i, 'isin', e.target.value)}
                        className="bg-slate-700 rounded px-1 py-0.5 w-28 text-white text-xs font-mono"
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <select
                        value={h.assetType}
                        onChange={(e) =>
                          updateHolding(i, 'assetType', e.target.value as 'ETF' | 'Stock')
                        }
                        className="bg-slate-700 rounded px-1 py-0.5 text-white text-xs"
                      >
                        <option value="ETF">ETF</option>
                        <option value="Stock">Stock</option>
                      </select>
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="number"
                        value={h.quantity}
                        onChange={(e) => updateHolding(i, 'quantity', parseInt(e.target.value, 10))}
                        className="bg-slate-700 rounded px-1 py-0.5 w-16 text-white text-xs"
                      />
                    </td>
                    <td className="py-1 pr-3 text-right">{formatCents(h.priceCents)}</td>
                    <td className="py-1 text-right">{formatCents(h.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.notes && <p className="text-xs text-slate-500 italic">{parsed.notes}</p>}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Confirm & Save'}
            </button>
            <button
              onClick={() => {
                setParsed(null);
                setHoldings([]);
                setStatus('idle');
                setMessage('');
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
