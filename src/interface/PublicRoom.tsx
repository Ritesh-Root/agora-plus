import React, { useEffect, useRef, useState } from 'react';
import { Hash, Send } from 'lucide-react';
import { wireAgent } from '../core/llm/connections';
import { getAllAgents } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { networkClient } from '../network/NetworkClient';
import { useRoomChatStore } from '../network/roomChatStore';
import { useRosterStore } from '../network/RosterStore';
import { parseRoomMentions } from '../../shared/mentions';
import { AgentPortrait } from './AgentPortrait';

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const match = text.slice(0, caret).match(/(^|\s)@([^\n@]*)$/);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

const PublicRoom: React.FC = () => {
  const messages = useRoomChatStore((s) => s.messages);
  const roster = useRosterStore((s) => s.roster);
  const self = useRosterStore((s) => s.self);
  const brief = useCoreStore((s) => s.userBrief);
  const team = useActiveTeam();
  const agents = getAllAgents(team);
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [closedQuery, setClosedQuery] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mention = mentionAt(draft, caret);
  const mentionKey = mention ? `${mention.start}:${mention.query}` : null;
  const options = mention
    ? [
        { name: 'all', note: 'Everyone in the session', color: '#17150f' },
        ...agents.map((agent) => ({ name: agent.name, note: agent.description, color: agent.color })),
      ].filter((option) => option.name.toLowerCase().includes(mention.query.trim().toLowerCase()))
    : [];
  const menuOpen = !!mention && options.length > 0 && closedQuery !== mentionKey;

  useEffect(() => {
    setMenuIndex(0);
  }, [mentionKey]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, waiting]);

  useEffect(() => {
    if (!waiting) return;
    const last = messages[messages.length - 1];
    if (last?.playerId.startsWith('agent:')) setWaiting(false);
    const timer = window.setTimeout(() => setWaiting(false), 45000);
    return () => window.clearTimeout(timer);
  }, [messages, waiting]);

  const mentions = parseRoomMentions(draft, agents);
  const audience = mentions.all
    ? 'Everyone in the session can see this, and the team will discuss it.'
    : mentions.names.length === 1
      ? `Only ${mentions.names[0]} receives this.`
      : mentions.names.length > 1
        ? `Only ${mentions.names.join(', ')} receive this.`
        : 'People in the room can see this. Use @ to talk to the team.';

  const appendMention = (name: string) => {
    setDraft((value) => {
      const gap = value && !/\s$/.test(value) ? ' ' : '';
      const next = `${value}${gap}@${name} `;
      setCaret(next.length);
      return next;
    });
    setClosedQuery(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const insertMention = (name: string) => {
    if (!mention) return;
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(caret)}`;
    const pos = mention.start + name.length + 2;
    setDraft(next);
    setCaret(pos);
    setClosedQuery(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const asked = parseRoomMentions(text, agents);
    if (networkClient.isOpen()) {
      const config = useUiStore.getState().llmConfig;
      const file = useUiStore.getState().connections;
      networkClient.send({
        type: 'room-chat',
        text,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        agents: agents.map((agent) => wireAgent(agent, file)),
      });
    } else if (self) {
      useRoomChatStore.getState().add({
        id: `local-${Date.now()}`,
        playerId: self.id,
        name: self.name,
        text,
        timestamp: Date.now(),
        audience: !asked.all && asked.names.length > 0 ? 'direct' : 'room',
        forPlayerId: !asked.all && asked.names.length > 0 ? self.id : undefined,
      });
    }
    if (asked.all || asked.names.length > 0) setWaiting(true);
    setDraft('');
    setCaret(0);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex bg-[#fbfaf6] text-ink">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-zinc-200/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">People {roster.length}/5</p>
        <div className="mt-3 space-y-2">
          {roster.map((person) => (
            <div key={person.id} className="flex items-center gap-2">
              <AgentPortrait color={person.color} className="w-8 h-8 rounded-full shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{person.name}{person.id === self?.id ? ' · you' : ''}</p>
                <p className="text-[10px] text-zinc-400">{person.isHost ? 'Boss' : 'In the room'}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-widest text-zinc-400">{team.teamName}</p>
        <div className="mt-3 space-y-2 overflow-y-auto">
          <button
            type="button"
            onClick={() => appendMention('all')}
            className="w-full flex items-center gap-2 text-left rounded-xl px-1 py-1 hover:bg-zinc-100"
          >
            <div className="w-8 h-8 rounded-lg bg-ink text-white flex items-center justify-center text-[10px] font-black">@</div>
            <div>
              <p className="text-xs font-bold">@all</p>
              <p className="text-[10px] text-zinc-400">Everyone in the session</p>
            </div>
          </button>
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => appendMention(agent.name)}
              className="w-full flex items-center gap-2 text-left rounded-xl px-1 py-1 hover:bg-zinc-100"
            >
              <AgentPortrait color={agent.color} className="w-8 h-8 rounded-full shrink-0 bg-zinc-100" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{agent.name}</p>
                <p className="text-[10px] text-zinc-400 truncate">{agent.description}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-16 shrink-0 border-b border-zinc-200/80 px-5 flex items-center justify-between">
          <div>
            <h1 className="text-base font-black tracking-tight flex items-center gap-1.5"><Hash size={16} className="text-zinc-400" /> Public room</h1>
            <p className="text-[11px] text-zinc-400">{roster.length} {roster.length === 1 ? 'person' : 'people'} · {agents.length} {agents.length === 1 ? 'agent' : 'agents'}</p>
          </div>
          <button type="button" onClick={copyLink} className="text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-full border border-zinc-200 hover:border-zinc-400">
            {copied ? 'Link copied' : 'Invite'}
          </button>
        </div>

        <div ref={logRef} className="flex-1 overflow-y-auto px-5 py-4" role="log" aria-label="Public room messages">
          {messages.length === 0 && (
            <p className="text-sm text-zinc-400">No messages yet. @all asks the team to discuss. @name talks to one teammate.</p>
          )}
          {messages.map((message) => {
            const mine = message.playerId === self?.id;
            const speaker = agents.find((agent) => agent.name === message.name)
              ?? roster.find((person) => person.id === message.playerId)
              ?? roster.find((person) => person.name === message.name);
            return (
              <div key={message.id} className="flex gap-3 mb-4">
                <AgentPortrait color={speaker?.color ?? '#17150f'} className="w-8 h-8 rounded-full shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold">{message.name}{mine ? ' · you' : ''} <time className="font-medium text-zinc-400">{clock(message.timestamp)}</time></p>
                  <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap mt-1">{message.text}</p>
                </div>
              </div>
            );
          })}
          {waiting && <p className="text-sm text-zinc-400">The team is talking…</p>}
        </div>

        <form
          className="shrink-0 px-4 pb-4 relative"
          onSubmit={(event) => {
            event.preventDefault();
            if (menuOpen) return;
            send();
          }}
        >
          {menuOpen && (
            <ul className="absolute bottom-full left-4 right-4 mb-2 max-h-52 overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-lg" role="listbox">
              {options.map((option, index) => (
                <li key={option.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === menuIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(option.name);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left ${index === menuIndex ? 'bg-zinc-100' : ''}`}
                  >
                    {option.name === 'all' ? (
                      <span className="w-6 h-6 rounded-md text-[10px] font-black flex items-center justify-center bg-ink text-white">@</span>
                    ) : (
                      <AgentPortrait color={option.color} className="w-6 h-6 rounded-full shrink-0 bg-zinc-100" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-bold">@{option.name}</span>
                      <span className="block text-[10px] text-zinc-400 truncate">{option.note}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border border-zinc-200 rounded-2xl bg-white p-3">
            <textarea
              ref={inputRef}
              aria-label="Message the public room"
              value={draft}
              maxLength={2000}
              rows={2}
              placeholder="Message the room, or type @ for the team…"
              className="w-full resize-none bg-transparent text-sm outline-none"
              onChange={(event) => {
                setDraft(event.target.value);
                setCaret(event.target.selectionStart);
                setClosedQuery(null);
              }}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onKeyDown={(event) => {
                if (menuOpen) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setMenuIndex((index) => (index + 1) % options.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setMenuIndex((index) => (index - 1 + options.length) % options.length);
                    return;
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    insertMention(options[menuIndex]?.name ?? options[0].name);
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setClosedQuery(mentionKey);
                    return;
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-zinc-400">{audience}</span>
              <button type="submit" className="flex items-center gap-1 bg-butter text-ink text-[11px] font-black px-3 py-1.5 rounded-lg shrink-0">
                Send <Send size={12} />
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-zinc-400 mt-2">Enter to send · Shift + Enter for a new line. The team discusses here. Run Swarm when you want the project started.</p>
        </form>
      </main>

      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-zinc-200/80 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">The brief</p>
        <p className="text-sm leading-relaxed mt-2 text-zinc-600">{brief.trim() || 'No brief yet. Talk with the team here, then Run Swarm when you want them to start the work.'}</p>
      </aside>
    </div>
  );
};

export default PublicRoom;
