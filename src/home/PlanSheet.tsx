import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sheet } from './Sheet';

export function PlanSheet({
  runId,
  title,
  onClose,
  onLocked,
}: {
  runId: string | null;
  title: string;
  onClose: () => void;
  onLocked: () => void;
}) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    setText('');
    setFailed(false);
    void fetch(`/api/runs/${encodeURIComponent(runId)}/document`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          onLocked();
          return;
        }
        if (!response.ok) {
          setFailed(true);
          return;
        }
        setText(await response.text());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [onLocked, runId]);

  return (
    <Sheet open={runId !== null} onClose={onClose} title={title || 'Plan'} wide>
      {failed ? <p className="text-sm text-zinc-500">That plan is not ready to read yet.</p> : null}
      {!failed && !text ? <p className="text-sm text-zinc-500">Opening the plan…</p> : null}
      {text ? (
        <div className="markdown-content max-w-[68ch] text-[15px] leading-relaxed text-ink [&_a]:underline [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      ) : null}
    </Sheet>
  );
}
