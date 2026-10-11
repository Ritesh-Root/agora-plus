import React from 'react';
import { createPortal } from 'react-dom';
import { X, Brain, Shield, AlertTriangle, CheckCircle, Clock, Users, Loader2, Scale } from 'lucide-react';
import { useSocietyStore } from '../integration/store/societyStore';
import { networkClient } from '../network/NetworkClient';

function usageText(metrics: {
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCalls?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  missingUsage?: number;
  repairCalls?: number;
}): string {
  const planned = metrics.calls ?? 0;
  const total = metrics.totalCalls ?? planned;
  const repair = metrics.repairCalls ?? 0;
  const other = Math.max(0, total - planned - repair);
  const missing = metrics.missingUsage ?? 0;
  const parts = [
    `${total} model calls`,
    `${planned} planning, workers, and merge`,
  ];
  if (other > 0) parts.push(`${other} debate and other`);
  if (repair > 0) parts.push(`${repair} repair`);
  parts.push(`${metrics.totalPromptTokens ?? metrics.promptTokens ?? 0} input tokens`);
  parts.push(`${metrics.totalCompletionTokens ?? metrics.completionTokens ?? 0} output tokens`);
  if (missing > 0) parts.push(`${missing} calls had no token count`);
  parts.push('Cost unavailable');
  return parts.join(' · ');
}

function saveDocument(text: string): void {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agora-document.md';
  link.click();
  URL.revokeObjectURL(url);
}

export const SocietyPanel: React.FC = () => {
  const {
    isRunning,
    stage,
    runStatus,
    brief,
    tasks,
    negotiation,
    result,
    error,
    isSocietyPanelOpen,
    setSocietyPanelOpen,
    resetSociety
  } = useSocietyStore();

  if (!isSocietyPanelOpen) return null;

  const onClose = () => {
    setSocietyPanelOpen(false);
    if (!isRunning) {
      resetSociety();
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'done':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'healing':
        return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'escalated':
        return 'bg-red-50 text-red-600 border-red-100';
      default:
        return 'bg-zinc-50 text-zinc-600 border-zinc-100';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-6 pointer-events-auto">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-950/20 backdrop-blur-xl animate-fade-in" />
      <div className="relative w-full max-w-4xl max-h-[85vh] glass-modal rounded-[32px] flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100/80 flex items-center justify-between bg-white/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-ink text-white rounded-lg">
              <Brain size={16} className={isRunning ? "animate-pulse" : ""} />
            </div>
            <div>
              <h2 className="font-black text-ink uppercase tracking-tight text-xs leading-none">Society Workspace</h2>
              <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">Parallel task decomposition and execution</p>
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
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Workspace brief</span>
            <p className="text-xs text-zinc-700 font-semibold leading-relaxed mt-1">{brief}</p>
            {typeof result?.metrics?.calls === 'number' && (
              <p className="text-[10px] text-zinc-500 mt-2" data-testid="swarm-usage">
                {usageText(result.metrics)}
              </p>
            )}
          </div>

          {result?.spokenSummary?.trim() && (
            <div
              className="p-4 rounded-2xl border border-amber-300 bg-amber-50 shadow-sm"
              data-testid="spoken-summary"
            >
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-800 block">
                {/allerg|conflict/i.test(result.spokenSummary) ? 'Keeper says' : 'Spoken summary'}
              </span>
              <p className="text-sm font-semibold text-ink leading-relaxed mt-1">{result.spokenSummary}</p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl flex items-start gap-2.5">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-600">Swarm Error</p>
                <p className="text-xs text-red-700 mt-1 font-medium">{error}</p>
                {/model is not available|api key|not configured/i.test(error) ? (
                  <p className="text-xs text-red-700/80 mt-1">Pick a working model in Model connections (the key icon in the header), or configure a server model.</p>
                ) : null}
              </div>
            </div>
          )}

          {/* Task Grid */}
          <div className="space-y-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Collaborative Task Execution</span>
            
            {tasks.length === 0 && isRunning && (
              <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-2">
                <Loader2 className="animate-spin text-ink" size={24} />
                <span className="text-xs font-bold uppercase tracking-wider text-ink/80 animate-pulse">Manager decomposing brief into DAG...</span>
              </div>
            )}

            {result && !result.synthesis?.trim() && (
              <p className="text-xs text-zinc-600">No document was produced.</p>
            )}

            {isRunning && (stage === 'debating' || stage === 'assembling' || stage === 'repairing' || stage === 'cancel_requested') && (
              <p className="text-xs font-bold text-ink" data-testid="swarm-stage">
                {stage === 'debating'
                  ? 'Debating. Finished task cards are not the document yet.'
                  : stage === 'assembling'
                    ? 'Assembling document. Finished task cards are not the document yet.'
                    : stage === 'repairing'
                      ? 'Repairing document.'
                      : 'Cancellation requested.'}
              </p>
            )}
            {!isRunning && runStatus === 'stopped' && (
              <p className="text-xs font-bold text-ink" data-testid="swarm-stage">Execution stopped</p>
            )}

            {result?.synthesis && (
              <div className="p-4 border border-zinc-200/70 bg-white rounded-2xl shadow-sm">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Lead synthesis</span>
                {typeof result.wordCount === 'number' && (
                  <p className="text-[10px] font-bold text-ink mt-1" data-testid="document-word-count">{result.wordCount} words</p>
                )}
                {result.revisionLabel && (
                  <p className="text-xs font-bold text-amber-700 mt-1" data-testid="document-revision">{result.revisionLabel}</p>
                )}
                <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed mt-2">{result.synthesis}</p>
                <p className="text-[10px] text-zinc-500 mt-3">Save a copy if you want a file of your own. A server restart clears the room copy.</p>
                <button
                  type="button"
                  onClick={() => saveDocument(result.synthesis)}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px] font-black uppercase tracking-widest text-ink"
                >
                  Save a copy
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasks.map((task) => {
                const isExecuting = task.status === 'running' || task.status === 'healing';
                return (
                  <div 
                    key={task.id} 
                    className={`p-4 border rounded-2xl bg-white/70 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-3 transition-all duration-500 ${
                      isExecuting ? 'animate-border-glow' : 'border-zinc-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-ink leading-tight">{task.title}</h4>
                        <span className={`text-[8px] font-black px-2 py-0.5 uppercase tracking-wider rounded border ${getStatusBadgeColor(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest block mt-0.5">Role: {task.role}</span>
                    </div>

                    {task.output && (
                      <div className="p-3 bg-white border border-zinc-200/40 rounded-xl max-h-24 overflow-y-auto shadow-inner">
                        <p className="text-[10px] text-zinc-600 whitespace-pre-wrap leading-relaxed font-medium">{task.output}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> Attempt: {task.attempt || 1}/2
                      </span>
                      {task.attempt && task.attempt > 1 && task.status === 'done' && (
                        <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-wider animate-pulse-soft">
                          Self-Healed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Negotiation Debate Panel */}
          {negotiation && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-1.5">
                <Scale className="text-zinc-400" size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Referee Conflict Resolution Layer</span>
              </div>

              <div className="border border-zinc-100 rounded-2xl bg-zinc-50/50 p-4 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Conflict Context</span>
                    <p className="text-xs text-zinc-700 font-bold mt-0.5">{negotiation.topic}</p>
                  </div>
                  {negotiation.outcome && (
                    <span className={`text-[8px] font-black px-2.5 py-1 uppercase tracking-wider rounded-full border ${
                      negotiation.outcome === 'consensus' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {negotiation.outcome}
                    </span>
                  )}
                </div>

                {/* Score bar */}
                {negotiation.scores && negotiation.scores.length > 0 && (
                  <div className="p-3 bg-white border border-zinc-200/50 rounded-xl space-y-2 shadow-sm">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Stance scores</span>
                    <div className="space-y-1.5">
                      {negotiation.scores.map((sc) => (
                        <div key={sc.agent} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-ink w-24 truncate shrink-0">{sc.agent}</span>
                          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-ink rounded-full transition-all duration-500" style={{ width: `${sc.score}%` }} />
                          </div>
                          <span className="text-[9px] font-mono text-zinc-500 w-8 text-right">{sc.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {negotiation.transcript.map((t, idx) => (
                    <div key={idx} className="p-2.5 bg-white border border-zinc-100 rounded-xl shadow-sm transition-all duration-300 hover:shadow-md">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-ink">{t.agent}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-300">Round {t.round}</span>
                      </div>
                      <p className="text-[10px] text-zinc-600 leading-snug mt-1 font-medium">{t.argument}</p>
                    </div>
                  ))}
                </div>

                {negotiation.synthesis && (
                  <div className="p-3 bg-white border border-zinc-200/50 rounded-xl shadow-sm">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Consensus Deliverable</span>
                    <p className="text-xs text-zinc-700 leading-relaxed font-bold mt-1">{negotiation.synthesis}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metrics Summary */}
          {result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-100">
              <div className="p-3 bg-white/40 border border-zinc-200/55 rounded-xl text-center shadow-sm">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Total Tasks</span>
                <span className="text-lg font-black text-ink block mt-0.5">{result.metrics.taskCount}</span>
              </div>
              <div className="p-3 bg-white/40 border border-zinc-200/55 rounded-xl text-center shadow-sm">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Concurrency Peak</span>
                <span className="text-lg font-black text-ink block mt-0.5">{result.metrics.maxConcurrency}</span>
              </div>
              <div className="p-3 bg-white/40 border border-zinc-200/55 rounded-xl text-center shadow-sm">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Self-Healed</span>
                <span className="text-lg font-black text-ink block mt-0.5">{result.metrics.healed}</span>
              </div>
              <div className="p-3 bg-white/40 border border-zinc-200/55 rounded-xl text-center shadow-sm">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block">Wall Time</span>
                <span className="text-lg font-black text-ink block mt-0.5">{(result.metrics.wallMs / 1000).toFixed(2)}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-2 bg-white/30">
          {isRunning ? (
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Loader2 className="animate-spin text-ink" size={14} />
              {stage === 'debating'
                ? 'Debating'
                : stage === 'assembling'
                  ? 'Assembling document'
                  : stage === 'repairing'
                    ? 'Repairing document'
                    : stage === 'cancel_requested'
                      ? 'Cancellation requested'
                      : 'Executing agent society...'}
              {stage !== 'cancel_requested' && (
                <button
                  type="button"
                  data-testid="brief-cancel-btn"
                  onClick={() => {
                    useSocietyStore.getState().setRestartAfterStop(true);
                    networkClient.send({ type: 'cancel-run' });
                  }}
                  className="ml-2 px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px] font-black uppercase tracking-widest text-ink"
                >
                  Cancel and restart
                </button>
              )}
            </div>
          ) : (
            <button onClick={onClose} className="px-5 py-2.5 bg-ink hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-black/10">
              Close View
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
