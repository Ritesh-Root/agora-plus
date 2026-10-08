import { fetchPinned } from '../proxyGuard';

/**
 * Server-side OpenAI-compatible LLM provider interface and factory.
 * Automatically routes and maps request payloads dynamically depending on the key:
 * - NVIDIA NIM Catalog keys (starting with `nvapi-`) route to NVIDIA Integrate API
 * - Qwen Cloud / DashScope keys (starting with `sk-` / `sk-sp-`) route to Qwen Cloud
 *   Token Plan compatible-mode (token-plan.maas.qwencloudapi.com) by default
 */

export interface LLMLike {
  generateCompletion(
    messages: { role: string; content: string }[],
    tools?: unknown[],
    systemInstruction?: string,
    modelName?: string,
  ): Promise<{ content: string | null; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>;
}

export interface RunUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  missingUsage: number;
}

export interface ServerProvider extends LLMLike {
  prepareRequest(info: { runId?: string; stage: string; agent: string; attempt?: number }): void;
  takeUsage(): RunUsage;
}

export function isNvidiaTarget(apiKey: string, baseUrl?: string): boolean {
  return apiKey.trim().startsWith('nvapi-') || (baseUrl ?? '').includes('api.nvidia.com');
}

/** On NVIDIA NIM, Qwen Cloud model tiers map to the hosted qwen3.5 MoE model. */
export function requestModel(model: string, isNvidia: boolean): string {
  if (!isNvidia) return model;
  if (
    model.includes('qwen-max') ||
    model.includes('qwen-plus') ||
    model.includes('qwen-turbo') ||
    model.startsWith('qwen3.') ||
    model === 'glm-5.3'
  ) {
    return 'qwen/qwen3.5-122b-a10b';
  }
  return model;
}

/** Endpoint-specific request fields. The connection test sends the same ones, so its result matches real runs. */
export function requestOptions(model: string, isNvidia: boolean): Record<string, unknown> {
  if (isNvidia) {
    // qwen3.5 NIM backends 500 ("unit variant") unless max_completion_tokens is present.
    // Without thinking disabled, qwen3.5 reasons for minutes and can spend the whole
    // completion budget on hidden reasoning, returning empty content.
    return model.startsWith('qwen/')
      ? { max_completion_tokens: 8192, chat_template_kwargs: { thinking: false } }
      : { max_completion_tokens: 8192 };
  }
  return model.toLowerCase().includes('deepseek') ? { enable_thinking: false } : {};
}

export function createServerProvider(apiKey: string, options?: { baseUrl?: string; endpoint?: URL }): ServerProvider {
  const pinned = options?.endpoint;
  const requested = pinned ? pinned.toString() : options?.baseUrl?.trim();
  const isNvidia = isNvidiaTarget(apiKey, requested);
  const baseUrl = requested
    ? (requested.endsWith('/chat/completions') ? requested : `${requested.replace(/\/$/, '')}/chat/completions`)
    : isNvidia
      ? 'https://integrate.api.nvidia.com/v1/chat/completions'
      : 'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/chat/completions';

  const usage: RunUsage = { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
  const request = { runId: '-', stage: 'call', agent: '-', attempt: 1 };

  return {
    prepareRequest(info) {
      if (info.runId) request.runId = info.runId;
      request.stage = info.stage;
      request.agent = info.agent;
      request.attempt = info.attempt ?? 1;
    },
    takeUsage() {
      return { ...usage };
    },
    async generateCompletion(messages, tools, systemInstruction, modelName) {
      const model = requestModel(modelName || 'deepseek-v4.1-flash', isNvidia);

      const body: any = {
        model,
        messages: []
      };

      if (systemInstruction) {
        body.messages.push({ role: 'system', content: systemInstruction });
      }

      // Convert messages to standard chat completions format
      body.messages.push(...messages.map(m => ({
        role: m.role,
        content: m.content
      })));

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      Object.assign(body, requestOptions(model, isNvidia));

      // NIM's qwen3.5 pool intermittently 500s on identical requests (~1 in 6),
      // so transient 5xx/network failures get retried with backoff.
      const MAX_TRIES = 3;
      usage.calls += 1;
      for (let httpTry = 1; ; httpTry++) {
        try {
          console.info(`[ServerProvider] run=${request.runId} stage=${request.stage} agent=${request.agent} model=${model} attempt=${request.attempt} http=${httpTry}`);
          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          };
          const payload = JSON.stringify(body);
          const signal = AbortSignal.timeout(120_000);
          // A checked caller URL keeps the guard's URL object so the connection
          // stays on those addresses. A redirect is an error. Default hosts
          // were not supplied as a URL object and still use fetch.
          const response = pinned
            ? await fetchPinned(pinned, { method: 'POST', headers, body: payload, signal, timeoutMs: 120_000 })
            : await fetch(baseUrl, {
              method: 'POST',
              headers,
              body: payload,
              redirect: 'error',
              signal,
            });

          if (!response.ok) {
            const text = await response.text();
            if (response.status >= 500 && httpTry < MAX_TRIES) {
              await new Promise((r) => setTimeout(r, httpTry * 1500));
              continue;
            }
            throw new Error(`Inference API error (${response.status}): ${text}`);
          }

          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content ?? null;
          if ((content === null || !String(content).trim()) && httpTry < MAX_TRIES) {
            // NIM sometimes returns 200 with empty content — treat as transient
            await new Promise((r) => setTimeout(r, httpTry * 1500));
            continue;
          }
          const counted = data.usage
            ? {
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
              }
            : undefined;
          if (counted) {
            usage.promptTokens += counted.promptTokens;
            usage.completionTokens += counted.completionTokens;
          } else {
            usage.missingUsage += 1;
          }
          return { content, usage: counted };
        } catch (error) {
          const transient = error instanceof TypeError ||
            (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'));
          if (httpTry < MAX_TRIES && transient) {
            // network failure or request timeout — retry
            await new Promise((r) => setTimeout(r, httpTry * 1500));
            continue;
          }
          usage.missingUsage += 1;
          console.error('[ServerProvider] Completion failed:', error);
          throw error;
        }
      }
    }
  };
}
