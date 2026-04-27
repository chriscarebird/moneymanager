import { useState, useRef, type ChangeEvent } from 'react';
import { api, type ParsedTransaction } from '../../lib/api.js';

type Props = { onSaved?: () => void };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ActionBadge({ action }: { action: 'buy' | 'sell' }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${action === 'buy' ? 'bg-blue-900 text-blue-300' : 'bg-amber-900 text-amber-300'}`}>
      {action}
    </span>
  );
}

export function TransactionUpload({ onSaved }: Props) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<{ rows: ParsedTransaction[]; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError('');
    setParsed(null);
    setSuccess('');
    try {
      const fileBase64 = await toBase64(file);
      const result = await api.parseTransactionFile(fileBase64, file.name);
      setParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const { inserted } = await api.bulkSaveTransactions(parsed.rows);
      setSuccess(`Imported ${inserted} transaction${inserted !== 1 ? 's' : ''} successfully.`);
      setParsed(null);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* File picker */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select DeGiro transaction file (.xlsx or .csv)
        </label>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.xls"
          onChange={handleFile}
          disabled={parsing || saving}
          className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-700 file:text-white hover:file:bg-blue-600 disabled:opacity-50"
        />
        <p className="text-slate-600 text-xs mt-1">
          Export from DeGiro: Account → Transactions → Export. Dutch headers are supported.
        </p>
      </div>

      {parsing && <p className="text-slate-400 text-sm">Parsing file…</p>}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {success && <p className="text-green-400 text-sm">{success}</p>}

      {/* Preview table */}
      {parsed && !success && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-slate-300 text-sm font-medium">
              {parsed.rows.length} transaction{parsed.rows.length !== 1 ? 's' : ''} found
              {parsed.skipped > 0 && (
                <span className="text-slate-500 text-xs ml-2">({parsed.skipped} rows skipped)</span>
              )}
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-700 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 text-slate-400 font-medium">Date</th>
                  <th className="text-left px-2 py-1.5 text-slate-400 font-medium">Action</th>
                  <th className="text-left px-2 py-1.5 text-slate-400 font-medium">Product</th>
                  <th className="text-left px-2 py-1.5 text-slate-400 font-medium">ISIN</th>
                  <th className="text-right px-2 py-1.5 text-slate-400 font-medium">Qty</th>
                  <th className="text-right px-2 py-1.5 text-slate-400 font-medium">Price</th>
                  <th className="text-right px-2 py-1.5 text-slate-400 font-medium">Fee</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="px-2 py-1.5 text-slate-400">{row.date}</td>
                    <td className="px-2 py-1.5"><ActionBadge action={row.action} /></td>
                    <td className="px-2 py-1.5 text-white max-w-[120px] truncate" title={row.asset}>{row.asset.split('(')[0]?.trim()}</td>
                    <td className="px-2 py-1.5 text-slate-500 font-mono">{row.isin}</td>
                    <td className="px-2 py-1.5 text-slate-300 text-right">{row.quantity}</td>
                    <td className="px-2 py-1.5 text-slate-300 text-right">€{(row.priceCents / 100).toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-slate-500 text-right">
                      {row.feeCents > 0 ? `€${(row.feeCents / 100).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
            >
              {saving ? 'Importing…' : `Import ${parsed.rows.length} transactions`}
            </button>
            <button
              onClick={() => setParsed(null)}
              className="px-4 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
