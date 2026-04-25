import { useState, useRef, useEffect } from 'react';
import { Bot, Send, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import type { AdviceResponse } from '../../lib/api.js';

type Mode = 'rebalance' | 'rsu' | 'dca' | 'strategy' | 'uber-sell';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ModeConfig {
  id: Mode;
  label: string;
  description: string;
  apiMethod: () => Promise<AdviceResponse>;
}

function buildModes(investAmount: number): ModeConfig[] {
  return [
    {
      id: 'rebalance',
      label: 'Rebalance',
      description: 'Narrate current rebalancing trades',
      apiMethod: () => api.getRebalanceAdvice(),
    },
    {
      id: 'dca',
      label: `DCA €${investAmount}`,
      description: 'Monthly buy orders for an investment amount',
      apiMethod: () => api.getDCAAdvice(investAmount * 100),
    },
    {
      id: 'rsu',
      label: 'RSU Sell/Hold',
      description: 'Should I sell vested RSUs now?',
      apiMethod: () => api.getRSUAdvice(),
    },
    {
      id: 'strategy',
      label: 'Quarterly Review',
      description: 'Opus-powered full portfolio analysis (web search)',
      apiMethod: () => api.getStrategyAdvice(),
    },
    {
      id: 'uber-sell',
      label: 'Uber Trading Window',
      description: 'Sell recommendation with market context',
      apiMethod: () => api.getUberSellAdvice(),
    },
  ];
}

function ActionCard({ action }: { action: AdviceResponse['actions'][number] }) {
  const colour =
    action.priority === 'high'
      ? 'border-red-500 bg-red-500/10'
      : action.priority === 'medium'
        ? 'border-amber-500 bg-amber-500/10'
        : 'border-slate-600 bg-slate-800';

  return (
    <div className={`rounded-xl border p-3 mb-2 ${colour}`}>
      <div className="flex items-start gap-2">
        <span
          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
            action.priority === 'high'
              ? 'bg-red-500 text-white'
              : action.priority === 'medium'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-600 text-slate-300'
          }`}
        >
          {action.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{action.action}</p>
          <p className="text-xs text-slate-400 mt-0.5">{action.rationale}</p>
          {action.amountCents !== undefined && (
            <p className="text-xs text-blue-400 mt-1">
              €{(action.amountCents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdviceDisplay({
  advice,
  onFollowUp,
}: {
  advice: AdviceResponse;
  onFollowUp: (q: string) => void;
}) {
  const QUICK = ['Why this allocation?', 'What are the risks?', 'How urgent is this?'];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-2xl p-4">
        <p className="text-blue-300 text-sm font-medium mb-1">{advice.summary}</p>
        <p className="text-white text-sm leading-relaxed">{advice.recommendation}</p>
      </div>

      {/* Actions */}
      {advice.actions.length > 0 && (
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
            Actions
          </p>
          {advice.actions.map((a, i) => (
            <ActionCard key={i} action={a} />
          ))}
        </div>
      )}

      {/* Risks */}
      {advice.risks && advice.risks.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-3">
          <p className="text-amber-400 text-xs font-medium uppercase tracking-wide mb-1">Risks</p>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            {advice.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Notes */}
      {advice.notes && (
        <p className="text-xs text-slate-500 italic">{advice.notes}</p>
      )}

      {/* Quick follow-ups */}
      <div>
        <p className="text-slate-500 text-xs mb-2">Quick follow-ups:</p>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => onFollowUp(q)}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-full transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type Props = { restrictToMode?: Mode };

export function AdvisorScreen({ restrictToMode }: Props = {}) {
  const [mode, setMode] = useState<Mode>(restrictToMode ?? 'rebalance');
  const [investAmount, setInvestAmount] = useState(1000);
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const modes = buildModes(investAmount);
  const currentMode = modes.find((m) => m.id === mode)!;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatStreaming]);

  async function generateAdvice() {
    setLoading(true);
    setError('');
    setAdvice(null);
    setChatMessages([]);
    try {
      const result = await currentMode.apiMethod();
      setAdvice(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisory error');
    } finally {
      setLoading(false);
    }
  }

  async function sendChatMessage(text: string) {
    if (!text.trim() || chatStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatStreaming(true);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setChatMessages([...newMessages, assistantMsg]);

    try {
      const contextSummary = advice
        ? `Summary: ${advice.summary}\nRecommendation: ${advice.recommendation}`
        : '';

      const res = await fetch('/api/advice/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, contextSummary }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setChatMessages([...newMessages, { role: 'assistant', content: accumulated }]);
      }
    } catch (err) {
      setChatMessages([
        ...newMessages,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` },
      ]);
    } finally {
      setChatStreaming(false);
    }
  }

  const DCA_PRESETS = [500, 1000, 2000];

  return (
    <div className="space-y-4 pb-6">
      {/* Mode picker — hidden when a specific mode is forced */}
      <div className="bg-slate-800 rounded-2xl p-4">
        {!restrictToMode && (
          <>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
              Advisory Mode
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {modes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setAdvice(null); setError(''); setChatMessages([]); }}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    mode === m.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="text-slate-500 text-xs mb-3">{currentMode.description}</p>

        {/* DCA amount selector */}
        {mode === 'dca' && (
          <div className="flex gap-2 mb-3">
            {DCA_PRESETS.map((amt) => (
              <button
                key={amt}
                onClick={() => setInvestAmount(amt)}
                className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-colors ${
                  investAmount === amt
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                €{amt}
              </button>
            ))}
            <input
              type="number"
              value={investAmount}
              onChange={(e) => setInvestAmount(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 text-white text-sm text-right"
              placeholder="Custom"
            />
          </div>
        )}

        <button
          onClick={generateAdvice}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
        >
          {loading ? (
            <><RefreshCw size={16} className="animate-spin" /> Generating…</>
          ) : (
            <><Bot size={16} /> Generate Advice</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-2xl p-4 flex items-center gap-2">
          <XCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Advice display */}
      {advice && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-green-400" />
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              {currentMode.label} Advice
            </p>
          </div>
          <AdviceDisplay advice={advice} onFollowUp={(q) => sendChatMessage(q)} />
        </div>
      )}

      {/* Chat thread */}
      {(chatMessages.length > 0) && (
        <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
            Follow-up Chat
          </p>
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                {msg.content || (chatStreaming && i === chatMessages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Chat input — only show after advice has been generated */}
      {advice && (
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChatMessage(chatInput); } }}
            placeholder="Ask a follow-up question…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => sendChatMessage(chatInput)}
            disabled={!chatInput.trim() || chatStreaming}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
