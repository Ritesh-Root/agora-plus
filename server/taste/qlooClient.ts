import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { QlooCallRecord } from '../../shared/taste';

/**
 * One process-wide MCP client for the official Qloo MCP server (`qloo mcp` over stdio).
 * The child reads QLOO_API_KEY / QLOO_BASE_URL from our environment; the key never leaves
 * the child and is never logged or returned here.
 *
 * Every call goes through a small LRU cache (30 min) and a two-slot semaphore, so a council
 * of four people cannot burst the Qloo event quota.
 */

export type QlooStatus = QlooCallRecord['status'];

export interface QlooIssue {
  input: string;
  field?: string;
  kind?: string;
  candidates: { id: string; name?: string }[];
}

/** The harness result envelope, normalized. */
export interface QlooEnvelope {
  status: QlooStatus;
  summary: string;
  results: unknown[];
  result_count: number;
  error?: { code?: string; recovery?: string };
  /** Unresolved inputs from a needs_input result. */
  issues?: QlooIssue[];
}

/** Raw tool result, as the MCP client returns it. */
export interface QlooRawResult {
  structuredContent?: unknown;
  content?: unknown;
  isError?: boolean;
}

export type QlooReadiness = 'ready' | 'unconfigured' | 'unreachable';

/** What the council needs from Qloo. Swap it in tests with setQlooCaller(). */
export interface QlooCaller {
  callTool(tool: string, args: Record<string, unknown>): Promise<QlooRawResult>;
  readiness(): Promise<QlooReadiness>;
  /** Drop the connection so the next call starts a fresh child (picks up a new credential). */
  reset?(): void;
}

const STATUSES: ReadonlySet<string> = new Set(['ok', 'empty', 'needs_input', 'partial', 'degraded', 'error']);
const CALL_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 200;
const MAX_IN_FLIGHT = 2;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function stringEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return env;
}

/** The real caller: spawns `qloo mcp` lazily and reconnects once if the child died. */
class StdioQlooCaller implements QlooCaller {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    const command = process.env.QLOO_BIN?.trim() || 'qloo';
    const attempt = (async () => {
      const transport = new StdioClientTransport({ command, args: ['mcp'], env: stringEnv(), stderr: 'ignore' });
      const client = new Client({ name: 'agora-plus-taste', version: '0.1.0' });
      transport.onclose = () => {
        if (this.client === client) this.client = null;
      };
      await withTimeout(client.connect(transport), READY_TIMEOUT_MS, 'Starting qloo mcp');
      this.client = client;
      return client;
    })();
    this.connecting = attempt;
    return attempt.finally(() => {
      this.connecting = null;
    });
  }

  reset(): void {
    const client = this.client;
    this.client = null;
    if (client) void client.close().catch(() => undefined);
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<QlooRawResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let client: Client;
      try {
        client = await this.connect();
      } catch (error) {
        this.reset();
        if (attempt === 0) continue;
        throw error;
      }
      try {
        const result = await withTimeout(client.callTool({ name: tool, arguments: args }), CALL_TIMEOUT_MS, tool);
        return result as QlooRawResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const closed = this.client !== client || /closed|not connected|EPIPE|ECONNRESET/i.test(message);
        if (closed && attempt === 0) {
          this.reset();
          continue;
        }
        if (/timed out/.test(message)) this.reset();
        throw error;
      }
    }
    throw new Error('qloo mcp could not be reached');
  }

  async readiness(): Promise<QlooReadiness> {
    try {
      const raw = await withTimeout(this.callTool('qloo_capabilities', {}), READY_TIMEOUT_MS, 'qloo_capabilities');
      const adapter = asRecord(asRecord(raw.structuredContent)?.adapter);
      if (adapter?.ready === true) return 'ready';
      // The child reads the credential at start. Drop it so a later `qloo setup` takes effect.
      this.reset();
      return 'unconfigured';
    } catch {
      this.reset();
      return 'unreachable';
    }
  }
}

let caller: QlooCaller | null = null;

function currentCaller(): QlooCaller {
  if (!caller) caller = new StdioQlooCaller();
  return caller;
}

/** Tests pass a fake. null restores the real `qloo mcp` child on next use. */
export function setQlooCaller(next: QlooCaller | null): void {
  caller?.reset?.();
  caller = next;
  clearQlooCache();
}

// ---- cache ----

const cache = new Map<string, { at: number; envelope: QlooEnvelope }>();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = asRecord(value);
  if (record) {
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function clearQlooCache(): void {
  cache.clear();
}

function cacheGet(key: string): QlooEnvelope | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.envelope;
}

function cachePut(key: string, envelope: QlooEnvelope): void {
  cache.set(key, { at: Date.now(), envelope });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ---- semaphore ----

let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight -= 1;
}

/** For tests: how many calls hold a slot right now. */
export function qlooInFlight(): number {
  return inFlight;
}

// ---- normalization ----

function parseText(content: unknown): unknown {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    const record = asRecord(block);
    if (record?.type === 'text' && typeof record.text === 'string') {
      try {
        return JSON.parse(record.text);
      } catch {
        return { status: 'error', summary: record.text.slice(0, 200) };
      }
    }
  }
  return undefined;
}

function issuesOf(structured: Record<string, unknown>): QlooIssue[] {
  const resolution = asRecord(structured.resolution);
  const raw = Array.isArray(resolution?.issues) ? resolution.issues : [];
  const issues: QlooIssue[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record || typeof record.input !== 'string') continue;
    const candidates = (Array.isArray(record.candidates) ? record.candidates : [])
      .map((candidate) => asRecord(candidate))
      .filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate.id === 'string')
      .map((candidate) => ({
        id: candidate.id as string,
        ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
      }));
    issues.push({
      input: record.input,
      ...(typeof record.field === 'string' ? { field: record.field } : {}),
      ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
      candidates,
    });
  }
  return issues;
}

/** Turn whatever `qloo mcp` returned into the harness envelope. Never throws. */
export function normalizeEnvelope(raw: QlooRawResult | null | undefined): QlooEnvelope {
  const structured = asRecord(raw?.structuredContent) ?? asRecord(parseText(raw?.content));
  if (!structured) {
    return {
      status: 'error',
      summary: raw?.isError ? 'Qloo returned an error.' : 'Qloo returned no structured result.',
      results: [],
      result_count: 0,
    };
  }
  const status: QlooStatus = typeof structured.status === 'string' && STATUSES.has(structured.status)
    ? (structured.status as QlooStatus)
    : raw?.isError ? 'error' : 'ok';
  let results: unknown[] = [];
  if (Array.isArray(structured.results)) {
    results = structured.results;
  } else {
    const nested = asRecord(structured.results);
    const firstArray = nested ? Object.values(nested).find(Array.isArray) : undefined;
    if (firstArray) results = firstArray as unknown[];
  }
  const errorRecord = asRecord(structured.error);
  const envelope: QlooEnvelope = {
    status,
    summary: typeof structured.summary === 'string' ? structured.summary.slice(0, 300) : '',
    results,
    result_count: typeof structured.result_count === 'number' ? structured.result_count : results.length,
  };
  if (errorRecord) {
    envelope.error = {
      ...(typeof errorRecord.code === 'string' ? { code: errorRecord.code } : {}),
      ...(typeof errorRecord.recovery === 'string' ? { recovery: errorRecord.recovery.slice(0, 200) } : {}),
    };
  }
  const issues = issuesOf(structured);
  if (issues.length > 0) envelope.issues = issues;
  return envelope;
}

function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : 'Qloo call failed';
  // Belt and braces: the key is never in our messages, but never echo anything key-shaped.
  const key = process.env.QLOO_API_KEY;
  const scrubbed = key ? text.split(key).join('[redacted]') : text;
  return scrubbed.slice(0, 200);
}

/**
 * Call one Qloo MCP tool. Cached for 30 minutes per tool+args (ok and empty results only),
 * at most two in flight, 20 s each. Errors come back as an error envelope, never a throw.
 */
export async function callQloo(
  tool: string,
  args: Record<string, unknown>,
  forWho?: string,
): Promise<{ envelope: QlooEnvelope; record: QlooCallRecord }> {
  const key = `${tool}:${stableStringify(args)}`;
  const started = Date.now();
  let envelope = cacheGet(key);
  if (!envelope) {
    await acquire();
    try {
      const raw = await currentCaller().callTool(tool, args);
      envelope = normalizeEnvelope(raw);
    } catch (error) {
      envelope = { status: 'error', summary: safeMessage(error), results: [], result_count: 0 };
    } finally {
      release();
    }
    if (envelope.status === 'ok' || envelope.status === 'empty') cachePut(key, envelope);
  }
  const record: QlooCallRecord = {
    tool,
    args,
    status: envelope.status,
    summary: envelope.summary || `${envelope.result_count} result${envelope.result_count === 1 ? '' : 's'}`,
    resultCount: envelope.result_count,
    ms: Date.now() - started,
  };
  if (forWho) record.forWho = forWho;
  return { envelope, record };
}

/** Whether `qloo mcp` started and has a credential, with the reason when it is not. */
export async function qlooReadiness(): Promise<QlooReadiness> {
  try {
    return await currentCaller().readiness();
  } catch {
    return 'unreachable';
  }
}

/** True when `qloo mcp` started and reports a usable credential. Makes no Qloo API call. */
export async function qlooReady(): Promise<boolean> {
  return (await qlooReadiness()) === 'ready';
}
