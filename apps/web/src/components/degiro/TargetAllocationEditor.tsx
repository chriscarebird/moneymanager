import { useState, type ChangeEvent } from 'react';
import { Trash2, Plus, ClipboardPaste } from 'lucide-react';
import type { TargetAllocation } from '../../lib/api.js';
import { api } from '../../lib/api.js';
import { formatPct } from '../../lib/calc.js';

type Props = {
  targets: TargetAllocation[];
  onSaved: () => void;
};

export function TargetAllocationEditor({ targets, onSaved }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState('');
  const [editIsin, setEditIsin] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [addIsin, setAddIsin] = useState('');
  const [addName, setAddName] = useState('');
  const [addPct, setAddPct] = useState('');
  const [addExchange, setAddExchange] = useState('XETRA');
  const [addFree, setAddFree] = useState(true);
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');
  const [pasteSaving, setPasteSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const total = targets.reduce((s, t) => s + (t.active ? t.targetPct : 0), 0);

  async function saveAllocation(target: TargetAllocation) {
    const pct = parseFloat(editPct);
    if (isNaN(pct) || pct < 0 || pct > 100) { setMsg('Invalid %'); return; }
    const isin = editIsin.trim().toUpperCase();
    if (!isin || isin.length < 10) { setMsg('Invalid ISIN'); return; }
    setSaving(true);
    try {
      await api.saveTarget({ ...target, targetPct: pct, etfIsin: isin });
      setMsg('Saved');
      setEditingId(null);
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(target: TargetAllocation) {
    try {
      await api.saveTarget({ ...target, active: !target.active });
      onSaved();
    } catch { /* ignore */ }
  }

  async function deleteAllocation(id: string) {
    setDeletingId(id);
    try {
      await api.deleteTarget(id);
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function addAllocation() {
    const pct = parseFloat(addPct);
    const isin = addIsin.trim().toUpperCase();
    const name = addName.trim();
    const exchange = addExchange.trim() || 'XETRA';
    if (!isin || isin.length < 10) { setAddMsg('Invalid ISIN'); return; }
    if (!name) { setAddMsg('Name required'); return; }
    if (isNaN(pct) || pct < 0 || pct > 100) { setAddMsg('Invalid target %'); return; }
    setAddSaving(true);
    setAddMsg('');
    try {
      await api.saveTarget({
        assetClass: 'Equity', etfIsin: isin, etfName: name,
        targetPct: pct, exchange, isFreeEtf: addFree, active: true,
      });
      setAddMsg('Added');
      setAddIsin(''); setAddName(''); setAddPct('');
      setAddExchange('XETRA'); setAddFree(true);
      setShowAddForm(false);
      onSaved();
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setAddSaving(false);
    }
  }

  async function bulkPaste() {
    const lines = pasteText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0) { setPasteMsg('Nothing to import'); return; }
    setPasteSaving(true);
    setPasteMsg('');
    let ok = 0; let errors = 0;
    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      const isin = (parts[0] ?? '').toUpperCase();
      const name = parts[1] ?? '';
      const pct = parseFloat(parts[2] ?? '0');
      const exchange = parts[3] ?? 'XETRA';
      const isFree = parts[4] !== undefined ? parts[4].toLowerCase() !== 'false' : true;
      if (!isin || isin.length < 10 || !name || isNaN(pct)) { errors++; continue; }
      try {
        await api.saveTarget({ assetClass: 'Equity', etfIsin: isin, etfName: name, targetPct: pct, exchange, isFreeEtf: isFree, active: true });
        ok++;
      } catch { errors++; }
    }
    setPasteMsg(`Imported ${ok}${errors > 0 ? `, ${errors} failed` : ''}`);
    if (ok > 0) { setPasteText(''); setShowPaste(false); onSaved(); }
    setPasteSaving(false);
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Target Allocations
        </p>
        <span className={`text-xs font-medium ${Math.abs(total - 100) < 0.1 ? 'text-green-400' : 'text-amber-400'}`}>
          {formatPct(total)} total
        </span>
      </div>

      {msg && <p className="text-xs text-amber-400 mb-2">{msg}</p>}

      <div className="space-y-2">
        {targets.map((t) => (
          <div key={t.id} className={`py-2 border-b border-slate-700 last:border-0 ${!t.active ? 'opacity-40' : ''}`}>
            {editingId === t.id ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-white truncate">{t.etfName.split('(')[0]?.trim()}</p>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-white px-1">✕</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={editIsin}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditIsin(e.target.value.toUpperCase())}
                    placeholder="ISIN"
                    className="w-32 bg-slate-600 rounded px-2 py-1 text-white text-xs font-mono"
                  />
                  <input
                    type="number"
                    value={editPct}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditPct(e.target.value)}
                    className="w-16 bg-slate-600 rounded px-2 py-1 text-white text-sm text-right"
                  />
                  <span className="text-slate-400 text-sm">%</span>
                  <button onClick={() => saveAllocation(t)} disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">
                    {saving ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{t.etfName.split('(')[0]?.trim()}</p>
                  <p className="text-xs text-slate-500">
                    {t.etfIsin} · {t.exchange}
                    {t.isFreeEtf && <span className="ml-1 text-green-500 font-medium">FREE</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium text-white">{formatPct(t.targetPct)}</span>
                  <button onClick={() => { setEditingId(t.id); setEditPct(String(t.targetPct)); setEditIsin(t.etfIsin); setMsg(''); }} className="text-xs text-slate-500 hover:text-blue-400">Edit</button>
                  <button onClick={() => toggleActive(t)} className="text-xs text-slate-500 hover:text-slate-300">{t.active ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => deleteAllocation(t.id)} disabled={deletingId === t.id} className="text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {targets.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">No target allocations set yet</p>
      )}

      <div className="mt-4 pt-4 border-t border-slate-700">
        {showAddForm ? (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium mb-2">Add Allocation</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={addIsin} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddIsin(e.target.value)} placeholder="ISIN (e.g. IE00B3RBWM25)" className="col-span-2 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={addName} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddName(e.target.value)} placeholder="ETF Name" className="col-span-2 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex items-center gap-1">
                <input type="number" value={addPct} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddPct(e.target.value)} placeholder="Target %" className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-slate-400 text-sm">%</span>
              </div>
              <input type="text" value={addExchange} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddExchange(e.target.value)} placeholder="Exchange" className="bg-slate-700 rounded-lg px-3 py-2 text-white text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={addFree} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddFree(e.target.checked)} className="accent-green-500" />
              Free ETF (no transaction fee)
            </label>
            {addMsg && <p className={`text-xs ${addMsg === 'Added' ? 'text-green-400' : 'text-amber-400'}`}>{addMsg}</p>}
            <div className="flex gap-2">
              <button onClick={addAllocation} disabled={addSaving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">{addSaving ? '…' : 'Add'}</button>
              <button onClick={() => { setShowAddForm(false); setAddMsg(''); }} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        ) : showPaste ? (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium mb-1">Bulk Paste</p>
            <p className="text-slate-500 text-xs mb-2">One per line: <code className="text-slate-400">ISIN, Name, Target%, Exchange, isFree</code></p>
            <textarea value={pasteText} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPasteText(e.target.value)} rows={5} placeholder={'IE00B3RBWM25, VWRL, 60, XETRA, true\nIE00B3XXRP09, VUSA, 20'} className="w-full bg-slate-700 rounded-lg px-3 py-2 text-white text-xs border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            {pasteMsg && <p className={`text-xs ${pasteMsg.includes('failed') ? 'text-amber-400' : 'text-green-400'}`}>{pasteMsg}</p>}
            <div className="flex gap-2">
              <button onClick={bulkPaste} disabled={pasteSaving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">{pasteSaving ? '…' : 'Import'}</button>
              <button onClick={() => { setShowPaste(false); setPasteMsg(''); }} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setShowAddForm(true); setShowPaste(false); }} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded-lg transition-colors">
              <Plus size={13} /> Add ISIN
            </button>
            <button onClick={() => { setShowPaste(true); setShowAddForm(false); }} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded-lg transition-colors">
              <ClipboardPaste size={13} /> Bulk Paste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
