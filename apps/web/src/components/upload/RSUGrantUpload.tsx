import { useState, type ChangeEvent } from 'react';
import { StatusMessage } from './StatusMessage.js';

type ParsedRSUGrant = {
  grantId: string;
  totalRsus: number;
  vestingCommencementDate: string;
  vestingFormula: string;
  dateOfGrant?: string;
  confidence?: number;
  notes?: string;
};

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

export function RSUGrantUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState<ParsedRSUGrant | null>(null);
  const [grant, setGrant] = useState<ParsedRSUGrant | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setMessage('Parsing RSU grant document with Claude...');
    setParsed(null);

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png';

      const res = await fetch('/api/uploads/rsu-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mediaType }),
        credentials: 'include',
      });
      const json = (await res.json()) as { data: ParsedRSUGrant | null; error: string | null };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Parse failed');
      }
      const result = json.data!;
      setParsed(result);
      setGrant(result);
      setStatus('success');
      setMessage('Grant parsed. Review and confirm below.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to parse document');
    }
  }

  async function handleConfirm() {
    if (!grant) return;
    setSaving(true);
    setMessage('Saving to database...');

    try {
      const res = await fetch('/api/portfolio/rsu-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantId: grant.grantId,
          totalRsus: grant.totalRsus,
          vestingCommencementDate: grant.vestingCommencementDate,
          vestingFormula: grant.vestingFormula,
          dateOfGrant: grant.dateOfGrant ?? grant.vestingCommencementDate,
          status: 'active',
        }),
        credentials: 'include',
      });
      const json = (await res.json()) as {
        data: { grantId: string } | null;
        error: string | null;
      };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? 'Save failed');
      }
      setStatus('success');
      setMessage(`RSU grant ${json.data?.grantId ?? ''} saved successfully.`);
      setParsed(null);
      setGrant(null);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function updateGrant(field: keyof ParsedRSUGrant, value: string | number) {
    setGrant((prev) => (prev ? { ...prev, [field]: value } : null));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          RSU Grant Document (PDF or image)
        </label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={handleFileChange}
          disabled={status === 'loading'}
          className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 disabled:opacity-50"
        />
      </div>

      <StatusMessage status={status} message={message} />

      {parsed && grant && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">
            Review grant parameters — edit any values before confirming
          </h3>
          {parsed.confidence !== undefined && (
            <p className="text-xs text-slate-500">
              Parser confidence: {Math.round(parsed.confidence * 100)}%
            </p>
          )}
          <div className="bg-slate-700 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Grant ID</label>
                <input
                  value={grant.grantId}
                  onChange={(e) => updateGrant('grantId', e.target.value)}
                  className="bg-slate-600 rounded px-2 py-1 w-full text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Total RSUs</label>
                <input
                  type="number"
                  value={grant.totalRsus}
                  onChange={(e) => updateGrant('totalRsus', parseInt(e.target.value, 10))}
                  className="bg-slate-600 rounded px-2 py-1 w-full text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Vesting commencement date</label>
                <input
                  value={grant.vestingCommencementDate}
                  onChange={(e) => updateGrant('vestingCommencementDate', e.target.value)}
                  className="bg-slate-600 rounded px-2 py-1 w-full text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Date of grant</label>
                <input
                  value={grant.dateOfGrant ?? ''}
                  onChange={(e) => updateGrant('dateOfGrant', e.target.value)}
                  className="bg-slate-600 rounded px-2 py-1 w-full text-white font-mono text-xs"
                  placeholder="ISO 8601 date"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="block text-slate-400 mb-1">Vesting formula</label>
              <input
                value={grant.vestingFormula}
                onChange={(e) => updateGrant('vestingFormula', e.target.value)}
                className="bg-slate-600 rounded px-2 py-1 w-full text-white"
              />
            </div>
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
                setGrant(null);
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
