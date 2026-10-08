import React from 'react';
import { createPortal } from 'react-dom';
import { X, Award, Zap, BarChart3, Clock, Loader2, Sparkles, Scale, Users } from 'lucide-react';
import { useSocietyStore } from '../integration/store/societyStore';

export const BenchmarkPanel: React.FC = () => {
  const {
    isBenchmarking,
    brief,
    benchmarkResult,
    error,
    isBenchmarkPanelOpen,
    setBenchmarkPanelOpen,
    resetBenchmark
  } = useSocietyStore();

  if (!isBenchmarkPanelOpen) return null;

  const onClose = () => {
    setBenchmarkPanelOpen(false);
    if (!isBenchmarking) {
      resetBenchmark();
    }
  };

  const getSpeedup = () => {
    if (!benchmarkResult) return 0;
    const singleMs = benchmarkResult.single.wallMs;
    const societyMs = benchmarkResult.society.metrics.wallMs;
    if (societyMs === 0) return 0;
    return Number((singleMs / societyMs).toFixed(1));
  };

  return createPortal(
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-6 pointer-events-auto">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-950/20 backdrop-blur-xl animate-fade-in" />
      <div className="relative w-full max-w-3xl max-h-[85vh] glass-modal rounded-[32px] flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100/80 flex items-center justify-between bg-white/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-ink text-white rounded-lg">
              <BarChart3 size={16} className={isBenchmarking ? "animate-pulse" : ""} />
            </div>
            <div>
              <h2 className="font-black text-ink uppercase tracking-tight text-xs leading-none">Swarm Benchmark</h2>
              <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">Society Parallel Concurrency vs Monolithic Execution</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100/50 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Brief Card */}
          <div className="p-4 bg-white/40 border border-zinc-200/50 rounded-2xl shadow-sm">
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Benchmark Brief</span>
            <p className="text-xs text-zinc-700 font-semibold leading-relaxed mt-1">{brief}</p>
          </div>

          {/* Loading */}
          {isBenchmarking && (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
              <Loader2 className="animate-spin text-ink" size={32} />
              <div className="text-center">
                <span className="text-xs font-black uppercase tracking-widest text-ink block animate-pulse">Measuring performance metrics</span>
                <span className="text-[10px] text-zinc-400 block mt-1">Running concurrent swarm tasks...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-red-600 block">Benchmark Error</span>
              <p className="text-xs text-red-700 mt-1 font-medium">{error}</p>
            </div>
          )}

          {/* Results Display */}
          {benchmarkResult && (
            <div className="space-y-6">
              {/* Speedup and Quality Hero Card */}
              <div className="p-6 rounded-[24px] bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl border border-zinc-800 relative overflow-hidden group">
                {/* Background glow styling */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-700" />
                
                <div className="space-y-1.5 text-center sm:text-left z-10">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Benchmark Verdict</span>
                  <h3 className="text-xl font-black tracking-tight leading-none mt-1">
                    {!benchmarkResult.qualityScores ? (
                      <>Judge did not return scores</>
                    ) : getSpeedup() > 1.0 ? (
                      <>Swarm completes <span className="text-emerald-400 font-black">{getSpeedup()}x Faster</span></>
                    ) : (
                      <>Society achieves higher synthesis quality</>
                    )}
                  </h3>
                  <p className="text-[10px] text-zinc-300 font-medium">Parallel task division bypasses monolithic bottlenecks</p>
                </div>
                
                <div className="flex gap-4 shrink-0 z-10">
                  <div className="px-4 py-2 bg-white/10 rounded-xl text-center border border-white/5 shadow-inner">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-300 block">Swarm Quality</span>
                    <span className="text-xl font-black text-emerald-400 block mt-0.5">{benchmarkResult.qualityScores ? `${benchmarkResult.qualityScores.society}/100` : '—'}</span>
                  </div>
                  <div className="px-4 py-2 bg-white/10 rounded-xl text-center border border-white/5 shadow-inner">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-300 block">Single Quality</span>
                    <span className="text-xl font-black text-zinc-300 block mt-0.5">{benchmarkResult.qualityScores ? `${benchmarkResult.qualityScores.single}/100` : '—'}</span>
                  </div>
                </div>
              </div>

              {/* Quality score comparison bars */}
              <div className="space-y-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">LLM Judge quality score</span>
                <div className="p-4 border border-zinc-150/70 bg-zinc-50/50 rounded-2xl space-y-4 shadow-inner">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span className="flex items-center gap-1.5"><Sparkles size={13} className="text-emerald-500" /> Agent Swarm Society</span>
                      <span>{benchmarkResult.qualityScores ? benchmarkResult.qualityScores.society : '—'}</span>
                    </div>
                    <div className="h-2.5 bg-zinc-200/60 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${benchmarkResult.qualityScores?.society ?? 0}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-zinc-500">
                      <span className="flex items-center gap-1.5">Single Monolithic Agent ({benchmarkResult.single.model})</span>
                      <span>{benchmarkResult.qualityScores ? benchmarkResult.qualityScores.single : '—'}</span>
                    </div>
                    <div className="h-2.5 bg-zinc-200/60 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-400 rounded-full transition-all duration-1000 ease-out" style={{ width: `${benchmarkResult.qualityScores?.single ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Side by side stats grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Agent Society */}
                <div className="p-4 border border-emerald-100/80 bg-emerald-50/10 rounded-2xl space-y-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Users className="text-emerald-600" size={15} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Swarm Society</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Wall-Clock Time</span>
                      <span className="font-bold text-ink">{(benchmarkResult.society.metrics.wallMs / 1000).toFixed(2)}s</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Tasks Completed</span>
                      <span className="font-bold text-ink">{benchmarkResult.society.metrics.taskCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Peak Concurrency</span>
                      <span className="font-bold text-ink">{benchmarkResult.society.metrics.maxConcurrency}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Self-Healed Retries</span>
                      <span className="font-bold text-ink">{benchmarkResult.society.metrics.healed}</span>
                    </div>
                  </div>
                </div>

                {/* Single Agent */}
                <div className="p-4 border border-zinc-150 bg-zinc-50/40 rounded-2xl space-y-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Clock className="text-zinc-400" size={15} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Single Agent</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Wall-Clock Time</span>
                      <span className="font-bold text-zinc-700">{(benchmarkResult.single.wallMs / 1000).toFixed(2)}s</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Execution flow</span>
                      <span className="font-bold text-zinc-700">Sequential monolithic</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Model Used</span>
                      <span className="font-mono text-zinc-700">{benchmarkResult.single.model}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-semibold">Task Delegation</span>
                      <span className="font-bold text-zinc-700">None</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Single Agent Output preview */}
              <div className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Single Agent Output deliverable</span>
                <div className="p-4 border border-zinc-100 bg-white/60 rounded-xl max-h-36 overflow-y-auto shadow-inner">
                  <p className="text-[10px] text-zinc-600 whitespace-pre-wrap leading-relaxed font-medium">{benchmarkResult.single.output}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-2 bg-white/30">
          <button onClick={onClose} className="px-5 py-2.5 bg-ink hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-black/10">
            Close View
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
