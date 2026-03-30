import { useState, type ChangeEvent } from 'react';
import { StatusMessage } from './StatusMessage.js';

type ParsedMSEquity = {
  type: 'RSU' | 'ESPP' | 'Direct_Shares';
  sharesHeld: number;
  sharesAvailableToTransact: number;
  marketValueUsdCents: number;
  holdingPeriodActive: boolean;
};

type ParsedMSHoldings = {
  equity: ParsedMSEquity[];
  confidence?: number;
  notes?: string;
};

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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

type Props = { onSaved?: () => void };

export function MSHoldingsUpload({ onSaved }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState<ParsedMSHoldings | null>(null);
  const [equity, setEquity] = useState<ParsedMSEquity[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setMessage('Parsing Morgan Stanley screenshot with Claude...');
    setParsed(null);

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

      const res = await fetch('/api/uploads/ms-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
        credentials: 'include',
      });
      const json = (await res.json()) as { data: ParsedMSHoldings | null; error: string | null };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Parse failed');
      }
      const result = json.data!;
      setParsed(result);
      setEquity(result.equity);
      setStatus('success');
      setMessage(`Parsed ${result.equity.length} equity position(s). Review and confirm below.`);
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
      const res = await fetch('/api/portfolio/uber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equity }),
        credentials: 'include',
      });
      const json = (await res.json()) as { data: { saved: number } | null; error: string | null };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Save failed');
      }
      setStatus('success');
      setMessage(`Saved ${json.data?.saved ?? 0} equity position(s) successfully.`);
      setParsed(null);
      setEquity([]);
      onSaved?.();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function updateEquity(
    index: number,
    field: keyof ParsedMSEquity,
    value: string | number | boolean,
  ) {
    setEquity((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  }

  const typeLabels: Record<ParsedMSEquity['type'], string> = {
    RSU: 'RSU',
    ESPP: 'ESPP',
    Direct_Shares: 'Direct Shares',
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Morgan Stanley Holdings Screenshot
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

      {parsed && equity.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">
            Review equity positions — edit any values before confirming
          </h3>
          {parsed.confidence !== undefined && (
            <p className="text-xs text-slate-500">
              Parser confidence: {Math.round(parsed.confidence * 100)}%
            </p>
          )}
          <div className="space-y-3">
            {equity.map((e, i) => (
              <div key={i} className="bg-slate-700 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{typeLabels[e.type]}</span>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={e.holdingPeriodActive}
                      onChange={(ev) => updateEquity(i, 'holdingPeriodActive', ev.target.checked)}
                      className="rounded"
                    />
                    Holding period active
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Shares held</label>
                    <input
                      type="number"
                      value={e.sharesHeld}
                      onChange={(ev) =>
                        updateEquity(i, 'sharesHeld', parseInt(ev.target.value, 10))
                      }
                      className="bg-slate-600 rounded px-2 py-1 w-full text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Available to transact</label>
                    <input
                      type="number"
                      value={e.sharesAvailableToTransact}
                      onChange={(ev) =>
                        updateEquity(i, 'sharesAvailableToTransact', parseInt(ev.target.value, 10))
                      }
                      className="bg-slate-600 rounded px-2 py-1 w-full text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Market value (USD cents)</label>
                    <input
                      type="number"
                      value={e.marketValueUsdCents}
                      onChange={(ev) =>
                        updateEquity(i, 'marketValueUsdCents', parseInt(ev.target.value, 10))
                      }
                      className="bg-slate-600 rounded px-2 py-1 w-full text-white"
                    />
                    <span className="text-slate-500 text-xs mt-0.5 block">
                      = {formatUsdCents(e.marketValueUsdCents)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
                setEquity([]);
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
