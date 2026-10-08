import { isFailed, resolveRoutedAccess } from '../modelAccess';
import { createRoutingProvider } from '../routingProvider';
import type { ServerProvider } from '../society/provider';
import { createBedrockProvider, type BedrockProvider } from './bedrockProvider';

export type ServerLlmMode = 'bedrock' | 'key';

/** `bedrock` when the server should call Amazon Bedrock. Otherwise the saved API key. */
export function serverLlmMode(): ServerLlmMode {
  return process.env.AGORA_SERVER_LLM === 'bedrock' ? 'bedrock' : 'key';
}

let bedrock: BedrockProvider | null = null;

/** One Bedrock provider for the process. Built on first use so tests can inject their own client. */
export function getBedrock(): BedrockProvider {
  if (!bedrock) bedrock = createBedrockProvider();
  return bedrock;
}

/** Household actions and room runs use this when no caller passed a provider. */
export async function defaultServerProvider(): Promise<ServerProvider> {
  if (serverLlmMode() === 'bedrock') return getBedrock();
  const access = await resolveRoutedAccess({});
  if (isFailed(access.fallback)) {
    const reason = access.fallback.error;
    throw reason instanceof Error ? reason : new Error('No server model is configured.');
  }
  return createRoutingProvider(access);
}
