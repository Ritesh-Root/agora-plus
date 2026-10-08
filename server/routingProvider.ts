import { isFailed, type RoutedAccess } from './modelAccess';
import { createServerProvider, type ServerProvider } from './society/provider';

/** One provider that picks an endpoint from the agent named in prepareRequest. */
export function createRoutingProvider(
  access: RoutedAccess,
  options?: { fallbackProvider?: ServerProvider },
): ServerProvider {
  const cache = new Map<string, ServerProvider>();
  const inners: ServerProvider[] = [];
  const request = { runId: '-', stage: 'call', agent: '-', attempt: 1 };
  let fallbackAttached = false;

  function providerFor(apiKey: string, baseUrl?: string, endpoint?: URL): ServerProvider {
    const cacheKey = `${apiKey}\n${baseUrl ?? ''}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const created = createServerProvider(apiKey, baseUrl || endpoint ? { baseUrl, endpoint } : undefined);
    cache.set(cacheKey, created);
    inners.push(created);
    return created;
  }

  return {
    prepareRequest(info) {
      if (info.runId) request.runId = info.runId;
      request.stage = info.stage;
      request.agent = info.agent;
      request.attempt = info.attempt ?? 1;
    },
    takeUsage() {
      return inners.reduce((sum, inner) => {
        const usage = inner.takeUsage();
        sum.calls += usage.calls;
        sum.promptTokens += usage.promptTokens;
        sum.completionTokens += usage.completionTokens;
        sum.missingUsage += usage.missingUsage;
        return sum;
      }, { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 });
    },
    async generateCompletion(messages, tools, systemInstruction, modelName) {
      const route = access.agents.find((agent) => agent.name.toLowerCase() === request.agent.toLowerCase());
      if (!route && isFailed(access.fallback)) {
        const fallback = options?.fallbackProvider;
        if (!fallback) throw access.fallback.error;
        if (!fallbackAttached) {
          inners.push(fallback);
          fallbackAttached = true;
        }
        fallback.prepareRequest({ ...request });
        return fallback.generateCompletion(messages, tools, systemInstruction, modelName);
      }
      const chosen = route ?? access.fallback;
      if (isFailed(chosen)) throw chosen.error;
      const inner = providerFor(chosen.apiKey, chosen.baseUrl, chosen.endpoint);
      inner.prepareRequest({ ...request });
      return inner.generateCompletion(messages, tools, systemInstruction, route?.model || modelName);
    },
  };
}
