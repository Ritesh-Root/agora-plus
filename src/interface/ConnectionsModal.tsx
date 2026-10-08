import { Eye, EyeOff, X } from 'lucide-react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { validateConnection, type ModelConnection } from '../core/llm/connections';
import { useUiStore } from '../integration/store/uiStore';

interface ConnectionsModalProps {
  onClose: () => void;
}

const fieldClass = 'w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm text-ink outline-none focus:border-zinc-400';

async function testConnection(connection: { baseUrl: string; apiKey: string; model: string }): Promise<string> {
  const invalid = validateConnection({ name: 'Connection', baseUrl: connection.baseUrl, model: connection.model });
  if (invalid) return invalid;
  try {
    const response = await fetch('/api/model-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: connection.baseUrl.trim(),
        apiKey: connection.apiKey.trim(),
        model: connection.model.trim(),
      }),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    if (body.ok) return 'Connection works.';
    return body.error || 'The model could not answer just now.';
  } catch {
    return 'The model service could not be reached.';
  }
}

const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ onClose }) => {
  const connections = useUiStore((state) => state.connections);
  const saveModelConnection = useUiStore((state) => state.saveModelConnection);
  const removeModelConnection = useUiStore((state) => state.removeModelConnection);
  const chooseDefaultConnection = useUiStore((state) => state.chooseDefaultConnection);
  const [editing, setEditing] = useState<ModelConnection | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const startNew = () => {
    setEditing(null);
    setName('');
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setFormError(null);
    setTestResult(null);
    setShowKey(false);
  };

  const startEdit = (connection: ModelConnection) => {
    setEditing(connection);
    setName(connection.name);
    setBaseUrl(connection.baseUrl);
    setApiKey(connection.apiKey);
    setModel(connection.model);
    setFormError(null);
    setTestResult(null);
    setShowKey(false);
  };

  const save = () => {
    const saved = saveModelConnection({
      id: editing?.id,
      name,
      baseUrl,
      apiKey,
      model,
    });
    if ('error' in saved) {
      setFormError(saved.error);
      return;
    }
    const stored = useUiStore.getState().connections.connections.find((item) => item.id === saved.id) ?? null;
    setEditing(stored);
    setFormError(null);
    setTestResult('Saved in this browser.');
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testConnection({ baseUrl, apiKey, model });
    setTestResult(result);
    setTesting(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-auto overflow-hidden" data-testid="model-connections">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-100/80 backdrop-blur-xl" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(23,21,15,0.12)] p-8 md:p-10 border border-zinc-200/70">
        <button onClick={onClose} className="absolute top-6 right-6 text-zinc-300 hover:text-zinc-600 transition-colors cursor-pointer" type="button">
          <X size={18} />
        </button>
        <h2 className="text-3xl font-black text-ink tracking-tight mb-2">Model connections</h2>
        <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-6">
          Saved in this browser. A key is sent only with your own model call. It is not stored in the room.
        </p>

        <ul className="space-y-2 mb-6">
          {connections.connections.map((connection) => (
            <li key={connection.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink truncate">
                  {connection.name}
                  {connection.id === connections.defaultId ? <span className="ml-2 text-[10px] uppercase tracking-widest text-zinc-400">Default</span> : null}
                </p>
                <p className="text-[11px] font-mono text-zinc-500 truncate">{connection.model}</p>
              </div>
              {connection.id !== connections.defaultId && (
                <button type="button" onClick={() => chooseDefaultConnection(connection.id)} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 cursor-pointer">Use</button>
              )}
              <button type="button" onClick={() => startEdit(connection)} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 cursor-pointer">Edit</button>
              <button type="button" onClick={() => removeModelConnection(connection.id)} className="text-[10px] font-black uppercase tracking-widest text-red-400 cursor-pointer">Remove</button>
            </li>
          ))}
          {connections.connections.length === 0 && (
            <li className="text-sm text-zinc-400">No saved connection yet.</li>
          )}
        </ul>

        <div className="space-y-3">
          <input data-testid="connection-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Connection name" className={fieldClass} />
          <input data-testid="connection-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://…/v1" className={fieldClass} />
          <div className="relative">
            <input
              data-testid="connection-api-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API key"
              className={`${fieldClass} pr-12`}
            />
            <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 cursor-pointer">
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input data-testid="connection-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model ID" className={fieldClass} />
        </div>

        {formError && <p className="mt-3 text-xs font-medium text-red-600">{formError}</p>}
        {testResult && <p data-testid="connection-test-result" className="mt-3 text-xs font-medium text-zinc-600">{testResult}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={startNew} className="text-[11px] font-black uppercase tracking-widest text-zinc-400 cursor-pointer">New</button>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="connection-test"
              onClick={() => { void runTest(); }}
              disabled={testing}
              className="px-5 py-3 border border-zinc-200 rounded-full text-[10px] font-black uppercase tracking-widest text-ink cursor-pointer disabled:opacity-40"
            >
              {testing ? 'Testing' : 'Test connection'}
            </button>
            <button
              type="button"
              data-testid="connection-save"
              onClick={save}
              className="px-5 py-3 bg-ink text-white rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConnectionsModal;
