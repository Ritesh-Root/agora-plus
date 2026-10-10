import { Info, KeyRound, Maximize2, Settings, Users, Scale, Play, BarChart2, X, Brain, House } from 'lucide-react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import packageJson from '../../package.json';
import { useCoreStore } from '../integration/store/coreStore';
import { useUiStore } from '../integration/store/uiStore';
import { useRosterStore } from '../network/RosterStore';
import { useSocietyStore } from '../integration/store/societyStore';
import { getActiveAgentSet } from '../integration/store/teamStore';
import { getAllAgents } from '../data/agents';
import { MAX_PLAYERS } from '../../shared/protocol';
import { networkClient, startSwarm } from '../network/NetworkClient';
import ConnectionsModal from './ConnectionsModal';
import InfoModal from './InfoModal';
import { NegotiationArena } from './NegotiationArena';

const version = packageJson.version;

const Header: React.FC = () => {
  const { llmConfig, isBYOKOpen, setBYOKOpen, isNegotiationOpen, setNegotiationOpen } = useUiStore();
  const { setViewMode } = useCoreStore();
  const roster = useRosterStore((s) => s.roster);
  const self = useRosterStore((s) => s.self);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const swarmWorking = useSocietyStore((s) => s.isRunning || s.isBenchmarking);
  const swarmStage = useSocietyStore((s) => s.stage);
  const swarmLabel = swarmStage === 'debating'
    ? 'Debating'
    : swarmStage === 'assembling'
      ? 'Assembling document'
      : swarmStage === 'repairing'
        ? 'Repairing document'
        : swarmStage === 'cancel_requested'
          ? 'Cancellation requested'
          : swarmStage === 'planning'
            ? 'Planning'
            : 'Agents working';
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const hasKey = !!llmConfig.apiKey;

  // New Brief Input Modal State
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [briefType, setBriefType] = useState<'society' | 'benchmark'>('society');
  const [briefInput, setBriefInput] = useState('');

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleRunAction = () => {
    const brief = briefInput.trim();
    if (!brief) return;

    if (!networkClient.isOpen()) {
      useSocietyStore.getState().setSocietyError('The room is not connected, so the swarm did not start.');
      setBriefInput('');
      setBriefModalOpen(false);
      return;
    }

    const config = useUiStore.getState().llmConfig;

    if (briefType === 'society') {
      const status = useSocietyStore.getState().runStatus;
      if (status === 'running' || status === 'cancel_requested') {
        useSocietyStore.getState().setSocietyError('A run is already in progress.');
        return;
      }
      startSwarm(brief);
    } else {
      useSocietyStore.getState().startBenchmark(brief);
      const sent = networkClient.send({
        type: 'run-benchmark',
        brief,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      });
      if (!sent) useSocietyStore.getState().setSocietyError('The room is not connected, so the benchmark did not start.');
    }

    setBriefInput('');
    setBriefModalOpen(false);
  };

  return (
    <header className="h-16 flex items-center justify-between px-5 shrink-0 relative z-40">
      {/* Left: Project Title */}
      <div className="flex items-center min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-ink flex items-center justify-center shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-butter" />
          </div>
          <span className="text-lg font-black tracking-tight text-ink shrink-0">AGORA</span>
        </div>

        <div className="flex items-center gap-3 self-start mt-3 ml-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              data-testid="info-btn"
              onClick={() => setIsInfoOpen(true)}
              className="text-zinc-400 hover:text-ink transition-colors cursor-pointer"
            >
              <Info size={14} strokeWidth={2} />
            </button>
            <span className="text-[10px] font-medium text-zinc-400 font-mono">v{version}</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <a
              href="https://github.com/Ritesh-Root/agora"
              target="_blank"
              rel="noopener"
              className="text-zinc-300 hover:text-ink transition-colors shrink-0"
              title="View on GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Right: Global Controls */}
      <div className="flex items-center gap-3">
        {swarmWorking && (
          <span
            data-testid="swarm-working"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-white border border-zinc-200 text-[10px] font-black uppercase tracking-wider text-ink"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-butter animate-pulse" />
            {swarmLabel}
          </span>
        )}

        {/* Run Society Button */}
        <button
          data-testid="run-swarm-btn"
          onClick={() => { setBriefType('society'); setBriefModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-1 bg-butter hover:bg-butter-300 text-ink rounded-full transition-all shadow-sm active:scale-95 cursor-pointer h-9 shrink-0"
          title="Run Agent Society"
        >
          <Play size={12} fill="currentColor" />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden md:inline">Run Swarm</span>
        </button>

        {/* Swarm Bench Button */}
        <button
          data-testid="swarm-bench-btn"
          onClick={() => { setBriefType('benchmark'); setBriefModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-1 bg-ink hover:bg-zinc-800 text-white rounded-full transition-all shadow-sm active:scale-95 cursor-pointer h-9 shrink-0"
          title="Swarm Benchmark"
        >
          <BarChart2 size={12} />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden md:inline">Swarm Bench</span>
        </button>

        <button
          data-testid="manage-teams-btn"
          onClick={() => setViewMode('design')}
          className="flex items-center gap-2 px-4 py-1 bg-white border border-zinc-200 hover:border-zinc-400 text-ink rounded-full transition-all active:scale-95 cursor-pointer h-9 shrink-0 ml-1"
          title="Manage Teams"
        >
          <Settings size={14} className="group-hover:rotate-45 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Manage Teams</span>
        </button>

        <div className="w-px h-4 bg-zinc-200" />

        <div
          className="relative group"
          onMouseLeave={() => setPlayersOpen(false)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPlayersOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPlayersOpen(false);
          }}
        >
          <button
            type="button"
            data-testid="players-popover-btn"
            aria-expanded={playersOpen}
            aria-controls="players-popover"
            onClick={() => setPlayersOpen((open) => !open)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-ink transition-colors px-2 py-1"
            title="Players connected"
          >
            <Users size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">{roster.length}/{MAX_PLAYERS}</span>
          </button>

          <div
            id="players-popover"
            className={`absolute top-full right-0 mt-2 w-52 bg-white rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.15)] border border-zinc-100 p-2 transition-all z-50 group-hover:opacity-100 group-hover:visible ${playersOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
          >
            {roster.length === 0 ? (
              <p className="text-[10px] font-medium text-zinc-300 px-2 py-1.5">No players connected yet</p>
            ) : (
              roster.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-xs font-medium text-ink truncate flex-1">{p.name}</span>
                  {p.isHost && (
                    <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full shrink-0">
                      Host
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="w-px h-4 bg-zinc-200" />

        {self?.isHost ? (
          <button
            data-testid="end-session-btn"
            onClick={() => {
              if (!confirmEnd) {
                setConfirmEnd(true);
                return;
              }
              setConfirmEnd(false);
              networkClient.endSession();
            }}
            className="px-3 h-9 rounded-full bg-ink text-white text-[10px] font-black uppercase tracking-wider cursor-pointer"
            title="End the room for everyone"
          >
            {confirmEnd ? 'End for everyone' : 'End session'}
          </button>
        ) : (
          <button
            data-testid="leave-room-btn"
            onClick={() => networkClient.leaveRoom()}
            className="px-3 h-9 rounded-full border border-zinc-200 text-ink text-[10px] font-black uppercase tracking-wider cursor-pointer"
            title="Leave this room"
          >
            Leave room
          </button>
        )}

        <div className="w-px h-4 bg-zinc-200" />

        <div className="flex items-center gap-2">
          <a
            data-testid="household-btn"
            href="/"
            className="inline-flex min-h-6 items-center gap-1 rounded-md p-1 text-zinc-600 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            title="Home"
            aria-label="Home"
          >
            <House size={16} aria-hidden="true" />
            <span className="hidden text-[10px] font-black uppercase tracking-wider lg:inline">Home</span>
          </a>
          <button
            data-testid="fullscreen-btn"
            onClick={handleFullscreen}
            className="text-zinc-500 hover:text-ink transition-colors p-1"
            title="Fullscreen Browser"
          >
            <Maximize2 size={16} />
          </button>
          <button
            data-testid="negotiation-btn"
            onClick={() => setNegotiationOpen(true)}
            className="text-zinc-500 hover:text-ink transition-colors p-1"
            title="Negotiation Arena — agents debate to resolve conflicts"
          >
            <Scale size={16} />
          </button>
          <button
            data-testid="byok-btn"
            onClick={() => setBYOKOpen(true)}
            className="relative text-zinc-500 hover:text-ink transition-colors p-1"
            title="Model connections"
          >
            <KeyRound size={16} className={hasKey ? 'text-emerald-500 hover:text-emerald-600' : ''} />
            {hasKey && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {isInfoOpen && (
        <InfoModal key="info-modal" onClose={() => setIsInfoOpen(false)} />
      )}

      {isBYOKOpen && (
        <ConnectionsModal key="model-connections-modal" onClose={() => setBYOKOpen(false)} />
      )}

      {isNegotiationOpen && (
        <NegotiationArena key="negotiation-arena" onClose={() => setNegotiationOpen(false)} />
      )}

      {/* Brief Input Premium Modal */}
      {briefModalOpen && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-auto">
          <div onClick={() => setBriefModalOpen(false)} className="absolute inset-0 bg-zinc-100/60 backdrop-blur-xl" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border border-zinc-100 overflow-hidden flex flex-col p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-ink" />
                <h3 className="font-black text-ink uppercase tracking-tight text-xs">
                  {briefType === 'society' ? 'Initialize Swarm Run' : 'Swarm Benchmark Harness'}
                </h3>
              </div>
              <button onClick={() => setBriefModalOpen(false)} className="text-zinc-300 hover:text-zinc-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            
            {briefType === 'society' && (
              <p className="text-[10px] leading-relaxed text-zinc-500">
                This run uses {getAllAgents(getActiveAgentSet()).map((agent) => agent.name).join(', ')}.
              </p>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Brief Description</label>
              <textarea
                data-testid="brief-input"
                value={briefInput}
                onChange={(e) => setBriefInput(e.target.value)}
                placeholder={
                  briefType === 'society'
                    ? "Enter what you want the society to build (e.g. Design a landing page for a coffee shop, or Research and write a report on quantum computing)."
                    : "Enter brief to compare Society vs Single Agent performance side-by-side..."
                }
                className="w-full h-32 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-black/5 resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                data-testid="brief-cancel-btn"
                onClick={() => setBriefModalOpen(false)}
                className="px-5 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-500 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95"
              >
                Cancel
              </button>
              <button
                data-testid="brief-execute-btn"
                onClick={handleRunAction}
                disabled={!briefInput.trim()}
                className="px-5 py-2 bg-butter hover:bg-butter-300 disabled:opacity-40 text-ink rounded-full text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95"
              >
                {briefType === 'society' ? 'Execute Swarm' : 'Run Benchmark'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};

export default Header;
