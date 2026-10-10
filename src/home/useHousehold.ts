import { useCallback, useEffect, useRef, useState } from 'react';
import { emptySnapshot, parseSnapshot, type Snapshot } from '../interface/householdView';

export function useHousehold() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const noteTimer = useRef(0);

  const fail = useCallback((line: string) => {
    setError(line);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setError(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/household');
      if (response.status === 401) {
        setLocked(true);
        return;
      }
      if (!response.ok) return;
      const next = parseSnapshot(await response.json());
      if (!next) return;
      loaded.current = true;
      setLocked(false);
      setSnapshot(next);
    } catch {
      if (!loaded.current) fail('The household could not be reached.');
    }
  }, [fail]);

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearInterval(timer);
      if (document.hidden) return;
      timer = window.setInterval(() => {
        void refresh();
      }, 2500);
    };
    void refresh();
    arm();
    const onHide = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        return;
      }
      void refresh();
      arm();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(noteTimer.current);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [refresh]);

  const send = useCallback(async (path: string, method: string, body?: unknown) => {
    try {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401) {
        setLocked(true);
        return false;
      }
      if (!response.ok) {
        fail('That did not go through. Nothing changed.');
        return false;
      }
      await refresh();
      return true;
    } catch {
      fail('The household could not be reached.');
      return false;
    }
  }, [fail, refresh]);

  const addMemory = useCallback((text: string) => send('/api/memory', 'POST', { text, tags: [] }), [send]);
  const patchMemory = useCallback((id: string, text: string) => send(`/api/memory/${encodeURIComponent(id)}`, 'PATCH', { text }), [send]);
  const deleteMemory = useCallback((id: string) => send(`/api/memory/${encodeURIComponent(id)}`, 'DELETE'), [send]);
  const addTask = useCallback((title: string, list?: string) => {
    const body: { title: string; list?: string } = { title };
    if (list) body.list = list;
    return send('/api/tasks', 'POST', body);
  }, [send]);
  const completeTask = useCallback((id: string) => send(`/api/tasks/${encodeURIComponent(id)}/complete`, 'POST'), [send]);
  const reopenTask = useCallback((id: string) => send(`/api/tasks/${encodeURIComponent(id)}/reopen`, 'POST'), [send]);
  const removeTask = useCallback((id: string) => send(`/api/tasks/${encodeURIComponent(id)}`, 'DELETE'), [send]);
  const decideApproval = useCallback(
    (id: string, decision: 'approve' | 'reject') => send(`/api/approvals/${encodeURIComponent(id)}`, 'POST', { decision }),
    [send],
  );

  return {
    snapshot,
    locked,
    error,
    refresh,
    addMemory,
    patchMemory,
    deleteMemory,
    addTask,
    completeTask,
    reopenTask,
    removeTask,
    decideApproval,
  };
}
