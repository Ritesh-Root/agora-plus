import { DEFAULT_MODELS, DEFAULT_PROVIDER, PROVIDERS, shouldMigrateToTokenPlanBaseUrl } from './constants';
import type { LLMConfig, ProviderId } from './types';

export const CONNECTIONS_KEY = 'agora-model-connections';
export const LEGACY_CONNECTIONS_KEY = 'byok-config';

const LEGACY_QWEN_MODELS = new Set(['qwen-max', 'qwen-plus', 'qwen-turbo']);
const PREVIOUS_AUTO_DEFAULT = 'qwen3.8-max';

export interface ModelConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ConnectionFile {
  defaultId: string;
  connections: ModelConnection[];
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WiredAgent {
  name: string;
  description: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function emptyConnectionFile(): ConnectionFile {
  return { defaultId: '', connections: [] };
}

export function defaultConnection(file: ConnectionFile): ModelConnection | null {
  return file.connections.find((item) => item.id === file.defaultId) ?? file.connections[0] ?? null;
}

export function llmConfigFromConnection(connection: ModelConnection | null): LLMConfig {
  if (!connection) {
    return {
      provider: DEFAULT_PROVIDER,
      apiKey: '',
      baseUrl: PROVIDERS[DEFAULT_PROVIDER].baseUrl,
      model: DEFAULT_MODELS.text,
    };
  }
  const provider: ProviderId = connection.apiKey.startsWith('nvapi-') || connection.baseUrl.includes('api.nvidia.com')
    ? 'nvidia'
    : 'qwen';
  return {
    provider,
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    model: connection.model,
  };
}

/** Same one-time host and model fixes the single saved configuration used. */
export function migrateLegacyConfig(parsed: Record<string, unknown>): LLMConfig {
  const provider: ProviderId = parsed.provider === 'nvidia' ? 'nvidia' : DEFAULT_PROVIDER;
  const spec = PROVIDERS[provider];
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  let baseUrl = typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : spec.baseUrl;
  let model = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : spec.defaultModel;
  if (provider === 'qwen' && shouldMigrateToTokenPlanBaseUrl(baseUrl, apiKey)) baseUrl = spec.baseUrl;
  if (provider === 'qwen' && LEGACY_QWEN_MODELS.has(model)) model = spec.defaultModel;
  if (provider === 'qwen' && model === PREVIOUS_AUTO_DEFAULT && parsed.modelPinned !== true) model = spec.defaultModel;
  return { provider, apiKey, baseUrl, model };
}

export function validateConnection(input: { name: string; baseUrl: string; model: string }): string | null {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  if (!name) return 'Add a connection name.';
  if (name.length > 40) return 'Use a connection name of at most 40 characters.';
  if (!baseUrl) return 'Add the model endpoint URL.';
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:') return 'Only https endpoints are allowed.';
  } catch {
    return 'The model endpoint URL is not valid.';
  }
  if (!model) return 'Add a model ID.';
  if (model.length > 80) return 'Use a model ID of at most 80 characters.';
  return null;
}

/** randomUUID exists only in secure contexts, so a plain-http LAN room needs the fallback. */
function newId(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function upsertConnection(
  file: ConnectionFile,
  input: { id?: string; name: string; baseUrl: string; apiKey: string; model: string },
): { file: ConnectionFile; id: string } | { error: string } {
  const error = validateConnection(input);
  if (error) return { error };
  const next: ModelConnection = {
    id: input.id?.trim() || newId(),
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey.trim(),
    model: input.model.trim(),
  };
  const exists = file.connections.some((item) => item.id === next.id);
  const connections = exists
    ? file.connections.map((item) => (item.id === next.id ? next : item))
    : [...file.connections, next];
  const defaultId = file.defaultId && connections.some((item) => item.id === file.defaultId) ? file.defaultId : next.id;
  return { file: { defaultId, connections }, id: next.id };
}

export function removeConnection(file: ConnectionFile, id: string): ConnectionFile {
  const connections = file.connections.filter((item) => item.id !== id);
  const defaultId = connections.some((item) => item.id === file.defaultId) ? file.defaultId : (connections[0]?.id ?? '');
  return { defaultId, connections };
}

export function selectDefault(file: ConnectionFile, id: string): ConnectionFile {
  if (!file.connections.some((item) => item.id === id)) return file;
  return { ...file, defaultId: id };
}

function parseFile(raw: string | null): ConnectionFile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { defaultId?: unknown; connections?: unknown };
    if (!Array.isArray(parsed.connections)) return null;
    const connections: ModelConnection[] = [];
    for (const item of parsed.connections) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : '';
      const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
      const model = typeof record.model === 'string' ? record.model.trim() : '';
      if (!id || !name || !baseUrl || !model) continue;
      connections.push({ id, name, baseUrl, apiKey, model });
    }
    if (connections.length === 0) return emptyConnectionFile();
    const requested = typeof parsed.defaultId === 'string' ? parsed.defaultId : '';
    const defaultId = connections.some((item) => item.id === requested) ? requested : connections[0].id;
    return { defaultId, connections };
  } catch {
    return null;
  }
}

function writeFile(storage: KeyValueStore, file: ConnectionFile): void {
  storage.setItem(CONNECTIONS_KEY, JSON.stringify(file));
  // With no connection left, the legacy copy is overwritten too, so a removed key does not stay in storage.
  const selected = defaultConnection(file);
  storage.setItem(LEGACY_CONNECTIONS_KEY, JSON.stringify({ ...llmConfigFromConnection(selected), modelPinned: true }));
}

/** Load saved connections. A legacy single configuration is copied once and kept. */
export function loadConnectionFile(storage: KeyValueStore): ConnectionFile {
  const raw = storage.getItem(CONNECTIONS_KEY);
  if (raw !== null) return parseFile(raw) ?? emptyConnectionFile();
  const legacyRaw = storage.getItem(LEGACY_CONNECTIONS_KEY);
  if (!legacyRaw) return emptyConnectionFile();
  try {
    const legacy = migrateLegacyConfig(JSON.parse(legacyRaw) as Record<string, unknown>);
    const created = upsertConnection(emptyConnectionFile(), {
      name: legacy.provider === 'nvidia' ? 'NVIDIA' : 'Qwen Cloud',
      baseUrl: legacy.baseUrl || PROVIDERS[DEFAULT_PROVIDER].baseUrl,
      apiKey: legacy.apiKey || '',
      model: legacy.model || DEFAULT_MODELS.text,
    });
    if ('error' in created) return emptyConnectionFile();
    writeFile(storage, created.file);
    return created.file;
  } catch {
    return emptyConnectionFile();
  }
}

export function saveConnectionFile(storage: KeyValueStore, file: ConnectionFile): void {
  writeFile(storage, file);
}

/**
 * The model an agent asked for, or undefined when it should use its connection's model.
 * Built-in agents store DEFAULT_MODELS.text as a placeholder, so that value is not an override.
 */
function agentModelOverride(model: string | undefined): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'human' || trimmed === DEFAULT_MODELS.text) return undefined;
  return trimmed;
}

/**
 * Fields for one agent on a run or a chat reply.
 * A non-default connection sends its own URL and key, even when the key is empty,
 * so the server does not reuse the default connection's key.
 */
export function wireAgent(
  agent: { name: string; description: string; model?: string; connectionId?: string },
  file: ConnectionFile,
): WiredAgent {
  const selected = defaultConnection(file);
  const chosen = agent.connectionId ? file.connections.find((item) => item.id === agent.connectionId) : undefined;
  const connection = chosen ?? selected;
  const wired: WiredAgent = { name: agent.name, description: agent.description };
  const override = agentModelOverride(agent.model);
  if (!connection) {
    if (override) wired.model = override;
    return wired;
  }
  const model = override && override !== connection.model ? override : undefined;
  const own = !!chosen && chosen.id !== selected?.id;
  if (model) wired.model = model;
  else if (own) wired.model = connection.model;
  if (own) {
    wired.baseUrl = connection.baseUrl;
    wired.apiKey = connection.apiKey;
  }
  return wired;
}
