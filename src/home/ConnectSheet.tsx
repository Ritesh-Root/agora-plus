import { useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { quietButton } from './ui';

export function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const endpoint = `${origin}/mcp`;
  const command = `claude mcp add --transport http agora ${origin}/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"`;
  const [copied, setCopied] = useState<'endpoint' | 'command' | null>(null);

  const copy = async (value: string, which: 'endpoint' | 'command') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Use your household from anywhere">
      <div className="space-y-4 text-sm text-ink">
        <div className="space-y-2">
          <p className="text-[13px] text-zinc-500">Household endpoint</p>
          <p className="break-all rounded-xl bg-zinc-50 px-3 py-2 font-mono text-[13px]">{endpoint}</p>
          <button type="button" onClick={() => void copy(endpoint, 'endpoint')} className={`inline-flex items-center gap-2 ${quietButton}`}>
            {copied === 'endpoint' ? <Check size={18} strokeWidth={1.75} className="text-sage" aria-hidden="true" /> : null}
            {copied === 'endpoint' ? 'Copied' : 'Copy endpoint'}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] text-zinc-500">Claude Code</p>
          <p className="break-all rounded-xl bg-zinc-50 px-3 py-2 font-mono text-[13px] leading-relaxed">{command}</p>
          <button type="button" onClick={() => void copy(command, 'command')} className={`inline-flex items-center gap-2 ${quietButton}`}>
            {copied === 'command' ? <Check size={18} strokeWidth={1.75} className="text-sage" aria-hidden="true" /> : null}
            {copied === 'command' ? 'Copied' : 'Copy command'}
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-500">Alexa+: point an add-on at this endpoint with authorization code and PKCE. The steps live in the add-on notes.</p>
        <p className="text-[13px] leading-relaxed text-zinc-500">ChatGPT and Claude apps: add this server as a remote MCP connector. Use your own token. This page never shows it.</p>
      </div>
    </Sheet>
  );
}
