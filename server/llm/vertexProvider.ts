/**
 * Gemini on Vertex AI as the server model, through Vertex's OpenAI-compatible endpoint.
 * It reuses the OpenAI-compatible adapter, so the voice loop, household tools and swarm
 * use it unchanged. Auth is Application Default Credentials: the metadata server on
 * Cloud Run (the service account needs roles/aiplatform.user), gcloud ADC locally.
 * A token is fetched per request (google-auth-library caches and refreshes it). Nothing is logged.
 */

import { execFile } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';
import type { BedrockProvider } from './bedrockProvider';
import { createOpenAiCompatibleProvider } from './openaiProvider';

export const VERTEX_DEFAULT_MODEL = 'google/gemini-3.8-flash';
export const VERTEX_DEFAULT_FAST_MODEL = 'google/gemini-3.5-flash-lite';
/** Gemini 3 thinking tokens count against max_tokens; a small cap returns an empty answer. */
export const VERTEX_MIN_OUTPUT_TOKENS = 2048;
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** gcloud may hand back a cached token with little life left, so keep ours briefly. */
const GCLOUD_TOKEN_TTL_MS = 5 * 60_000;

type TokenSupplier = () => Promise<string>;
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface VertexOptions {
  project?: string;
  location?: string;
  model?: string;
  fastModel?: string;
  token?: TokenSupplier;
  fetch?: Fetch;
  retryDelayMs?: number;
  concurrency?: number;
}

export function vertexProject(): string {
  return (process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '').trim();
}

/** Ready when a Google Cloud project is set. Credentials are checked on the first call. */
export function vertexReady(): boolean {
  return Boolean(vertexProject());
}

/** Vertex wants publisher-prefixed ids. `gemini-3.8-flash` becomes `google/gemini-3.8-flash`. */
export function vertexModelId(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed.includes('/') ? trimmed : `google/${trimmed}`;
}

/**
 * Gemini 3 thinks by default. Flash-Lite accepts `minimal`; Flash rejects it (HTTP 400,
 * "THINKING_LEVEL_MINIMAL unsupported") and gets `low`. Other Vertex models get nothing.
 */
export function vertexReasoningEffort(model: string): string | undefined {
  if (!/gemini-3/i.test(model)) return undefined;
  return /flash-lite/i.test(model) ? 'minimal' : 'low';
}

export function vertexUrl(project: string, location: string): string {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/endpoints/openapi/chat/completions`;
}

function gcloudToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gcloud', ['auth', 'print-access-token'], { timeout: 10_000 }, (error, stdout) => {
      const token = String(stdout ?? '').trim();
      if (error || !token) reject(new Error('gcloud could not print an access token.'));
      else resolve(token);
    });
  });
}

/**
 * ADC first. Outside production, when ADC is not set up, fall back to the gcloud CLI login
 * (cached for 5 minutes).
 */
export function createGoogleTokenSupplier(): TokenSupplier {
  let auth: GoogleAuth | null = null;
  let cached: { token: string; until: number } | null = null;
  // After ADC fails in development, go straight to gcloud for a while instead of re-probing.
  let skipAdcUntil = 0;
  return async () => {
    try {
      if (Date.now() < skipAdcUntil) throw new Error('Application Default Credentials are not set up.');
      auth ??= new GoogleAuth({ scopes: SCOPE });
      const token = await auth.getAccessToken();
      if (token) return token;
      throw new Error('Application Default Credentials returned no token.');
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Vertex AI credentials are missing: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      if (Date.now() >= skipAdcUntil) skipAdcUntil = Date.now() + GCLOUD_TOKEN_TTL_MS;
      if (cached && cached.until > Date.now()) return cached.token;
      const token = await gcloudToken();
      cached = { token, until: Date.now() + GCLOUD_TOKEN_TTL_MS };
      return token;
    }
  };
}

function concurrencyFromEnv(): number {
  const parsed = Number.parseInt(process.env.VERTEX_CONCURRENCY ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
}

export function createVertexProvider(options: VertexOptions = {}): BedrockProvider {
  const project = (options.project ?? vertexProject()).trim();
  const location = (options.location ?? process.env.VERTEX_LOCATION ?? '').trim() || 'global';
  const model = vertexModelId(options.model ?? process.env.VERTEX_MODEL, VERTEX_DEFAULT_MODEL);
  const fastModel = vertexModelId(options.fastModel ?? process.env.VERTEX_FAST_MODEL, VERTEX_DEFAULT_FAST_MODEL);
  return createOpenAiCompatibleProvider({
    // An empty base URL makes the adapter throw missingConfigMessage on the first call.
    baseUrl: project ? vertexUrl(project, location) : '',
    apiKey: options.token ?? createGoogleTokenSupplier(),
    model,
    fastModel,
    fetch: options.fetch,
    retryDelayMs: options.retryDelayMs,
    reasoningEffort: vertexReasoningEffort,
    minOutputTokens: VERTEX_MIN_OUTPUT_TOKENS,
    thoughtSignatures: true,
    concurrency: options.concurrency ?? concurrencyFromEnv(),
    missingConfigMessage: 'Vertex AI is not configured. Set GOOGLE_CLOUD_PROJECT (and optionally VERTEX_LOCATION, VERTEX_MODEL).',
  });
}
