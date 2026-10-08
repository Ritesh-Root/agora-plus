import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Scale, Loader2, Trophy, AlertTriangle, Gavel } from 'lucide-react';
import { useUiStore } from '../integration/store/uiStore';
import { useActiveTeam } from '../integration/store/teamStore';
import { getAllCharacters } from '../data/agents';
import { createProvider, isValidKey } from '../core/llm/providers';
import { PROVIDERS, DEFAULT_PROVIDER } from '../core/llm/constants';
import { runNegotiation, type NegotiationResult, type Position } from '../core/society/Negotiation';

/** Agents debate a contested question; a Referee scores and reaches consensus or escalates. */
export const NegotiationArena: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const llmConfig = useUiStore((s) => s.llmConfig);
  const setBYOKOpen = useUiStore((s) => s.setBYOKOpen);
  const team = useActiveTeam();
  const agents = useMemo(() => getAllCharacters(team).filter((a) => a.index !== 0), [team]);

  const [topic, setTopic] = useState('');
  const [positions, setPositions] = useState<Position[]>(() => [
    { agent: agents[0]?.name || 'Agent A', stance: '' },
    { agent: agents[1]?.name || 'Agent B', stance: '' },
  ]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NegotiationResult | null>(null);

  const provider = llmConfig.provider ?? DEFAULT_PROVIDER;
  const hasKey = isValidKey(provider, llmConfig.apiKey);
  const canRun = hasKey && !!topic.trim() && positions.every((p) => p.agent.trim() && p.stance.trim()) && !running;

  const updatePos = (i: number, changes: Partial<Position>) =>
    setPositions((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...changes } : p)));

  const run = async () => {
    setError(null);
    setResult(null);
    if (!hasKey) { setError('Add an API key (BYOK) first.'); return; }
    setRunning(true);
    try {
      const llm = createProvider(provider, llmConfig.apiKey || '', llmConfig.baseUrl);
      const tiers = PROVIDERS[provider].tiers;
      const r = await runNegotiation(
        topic.trim(),
        positions.map((p) => ({ agent: p.agent.trim(), stance: p.stance.trim() })),
        llm,
        { maxRounds: 2, refereeModel: tiers.manager, debaterModel: tiers.worker },
      );
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const rounds = result ? Array.from(new Set(result.transcript.map((t) => t.round))) : [];
  const inputCls = 'w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-black/5';

  return createPortal((
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-6 pointer-events-auto">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-100/80 backdrop-blur-xl" />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] border border-zinc-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-ink" />
            <div>
              <h2 className="font-black text-ink uppercase tracking-tight text-sm leading-none">Negotiation Arena</h2>
              <p className="text-[10px] text-zinc-500 font-medium mt-0.5">Agents debate · a Referee resolves or escalates</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-300 hover:text-zinc-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Setup */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Contested question</label>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Should we ship the MVP next week or harden it for two more?" className={`${inputCls} h-16 resize-none mt-1.5`} />
            </div>
            {positions.map((p, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr] gap-2 items-start">
                <input value={p.agent} onChange={(e) => updatePos(i, { agent: e.target.value })} placeholder="Agent" className={`${inputCls} font-bold`} />
                <textarea value={p.stance} onChange={(e) => updatePos(i, { stance: e.target.value })} placeholder={`Position ${i + 1} — what does this agent argue for?`} className={`${inputCls} h-12 resize-none`} />
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-red-600 break-words">{error}</p>
                {!hasKey && (
                  <button onClick={() => setBYOKOpen(true)} className="mt-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700">Model connections</button>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3 pt-1">
              {/* Outcome banner */}
              {result.outcome === 'consensus' ? (
                <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-start gap-3">
                  <Trophy size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Consensus — {result.winner} wins (in {result.rounds} round{result.rounds > 1 ? 's' : ''})</p>
                    <p className="text-xs text-zinc-700 leading-relaxed mt-1">{result.synthesis}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 flex items-start gap-3">
                  <Gavel size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Escalated to human after {result.rounds} rounds</p>
                    <p className="text-xs text-zinc-700 leading-relaxed mt-1">{result.synthesis}</p>
                  </div>
                </div>
              )}

              {/* Final scores */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Referee scores</p>
                {result.scores.map((sc) => (
                  <div key={sc.agent} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-ink w-20 truncate shrink-0">{sc.agent}</span>
                    <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-ink rounded-full" style={{ width: `${sc.score}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">{sc.score}</span>
                  </div>
                ))}
              </div>

              {/* Transcript */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Debate</p>
                {rounds.map((round) => (
                  <div key={round} className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Round {round}</p>
                    {result.transcript.filter((t) => t.round === round).map((t, i) => (
                      <div key={i} className="p-2.5 bg-zinc-50 border border-zinc-100 rounded-xl">
                        <span className="text-[11px] font-black text-ink">{t.agent}</span>
                        <p className="text-[11px] text-zinc-600 leading-snug mt-0.5">{t.argument}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100">
          <button
            onClick={run}
            disabled={!canRun}
            className="w-full py-3 bg-ink hover:bg-black text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? <><Loader2 size={15} className="animate-spin" /> Debating…</> : <><Scale size={15} /> Run debate</>}
          </button>
          {!hasKey && !error && (
            <p className="text-[10px] text-zinc-500 text-center mt-2 font-medium">Requires a {PROVIDERS[provider].label} key — set it in BYOK.</p>
          )}
        </div>
      </div>
    </div>
  ), document.body);
};
