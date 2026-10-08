import { assertPublicHttpsTarget } from './proxyGuard';

/** The demo server key may be sent only to this host. */
export const APPROVED_SERVER_KEY_HOST = 'token-plan.maas.qwencloudapi.com';

const MISSING_KEY = 'Add an API key in the app, or set DASHSCOPE_API_KEY on the server.';
const CUSTOM_NEEDS_KEY = 'Add an API key for that model endpoint.';

function chatUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/$/, '');
  return root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
}

/**
 * Picks the key that may be sent to a model endpoint.
 * The server key is used only for the approved host. Any other URL requires the caller's key.
 */
export async function resolveModelAccess(
  input: { apiKey?: string; baseUrl?: string },
  resolve?: (hostname: string) => Promise<string[]>,
): Promise<{ apiKey: string; baseUrl?: string }> {
  const callerKey = input.apiKey?.trim() ?? '';
  const rawBase = input.baseUrl?.trim() ?? '';
  if (rawBase) {
    const url = await assertPublicHttpsTarget(chatUrl(rawBase), resolve);
    const approved = url.hostname.toLowerCase() === APPROVED_SERVER_KEY_HOST;
    if (!callerKey) {
      if (!approved) throw new Error(CUSTOM_NEEDS_KEY);
      const serverKey = process.env.DASHSCOPE_API_KEY?.trim() ?? '';
      if (!serverKey) throw new Error(MISSING_KEY);
      return { apiKey: serverKey, baseUrl: url.toString() };
    }
    return { apiKey: callerKey, baseUrl: url.toString() };
  }
  const key = callerKey || process.env.DASHSCOPE_API_KEY?.trim() || '';
  if (!key) throw new Error(MISSING_KEY);
  return { apiKey: key };
}

export interface ResolvedEndpoint {
  apiKey: string;
  baseUrl?: string;
}

export interface FailedEndpoint {
  error: unknown;
}

export interface RoutedAccess {
  fallback: ResolvedEndpoint | FailedEndpoint;
  agents: Array<{ name: string; model?: string } & (ResolvedEndpoint | FailedEndpoint)>;
}

function isFailed(endpoint: ResolvedEndpoint | FailedEndpoint): endpoint is FailedEndpoint {
  return 'error' in endpoint;
}

export { isFailed };

/**
 * Resolves the default connection and any agent that brought its own URL or key.
 * An agent failure stays on that agent. It does not borrow another agent's key or the server key
 * unless that agent's own URL is the approved host and its own key is empty.
 */
export async function resolveRoutedAccess(
  input: {
    apiKey?: string;
    baseUrl?: string;
    agents?: { name: string; apiKey?: string; baseUrl?: string; model?: string; own?: boolean }[];
  },
  resolve?: (hostname: string) => Promise<string[]>,
): Promise<RoutedAccess> {
  let fallback: ResolvedEndpoint | FailedEndpoint;
  try {
    fallback = await resolveModelAccess({ apiKey: input.apiKey, baseUrl: input.baseUrl }, resolve);
  } catch (error) {
    fallback = { error };
  }
  const agents: RoutedAccess['agents'] = [];
  for (const agent of input.agents ?? []) {
    if (!agent.own) continue;
    const model = agent.model?.trim() || undefined;
    try {
      const access = await resolveModelAccess({
        apiKey: agent.apiKey,
        baseUrl: agent.baseUrl?.trim() || input.baseUrl,
      }, resolve);
      agents.push({ name: agent.name, model, ...access });
    } catch (error) {
      agents.push({ name: agent.name, model, error });
    }
  }
  return { fallback, agents };
}
