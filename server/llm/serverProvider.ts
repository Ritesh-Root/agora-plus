import { isFailed, resolveRoutedAccess } from '../modelAccess';
import { createRoutingProvider } from '../routingProvider';
import type { ServerProvider } from '../society/provider';
import { createBedrockProvider, type BedrockProvider } from './bedrockProvider';
import { createOpenAiCompatibleProvider } from './openaiProvider';
import { createVertexProvider } from './vertexProvider';

export type ServerLlmMode = 'bedrock' | 'openai' | 'vertex' | 'key';

/**
 * `bedrock` calls Amazon Bedrock. `openai` calls the OpenAI-compatible endpoint in
 * AGORA_LLM_BASE_URL (Featherless, vLLM). `vertex` calls Gemini on Vertex AI
 * (GOOGLE_CLOUD_PROJECT, Application Default Credentials). Otherwise the saved API key.
 */
export function serverLlmMode(): ServerLlmMode {
  const mode = process.env.AGORA_SERVER_LLM;
  if (mode === 'bedrock') return 'bedrock';
  if (mode === 'openai') return 'openai';
  if (mode === 'vertex') return 'vertex';
  return 'key';
}

let bedrock: BedrockProvider | null = null;

/** One Bedrock provider for the process. Built on first use so tests can inject their own client. */
export function getBedrock(): BedrockProvider {
  if (!bedrock) bedrock = createBedrockProvider();
  return bedrock;
}

let compatible: BedrockProvider | null = null;
let vertex: BedrockProvider | null = null;

/** The model the voice loop and household tools call: Bedrock, the OpenAI-compatible endpoint, or Vertex AI. */
export function getToolModel(): BedrockProvider | null {
  const mode = serverLlmMode();
  if (mode === 'bedrock') return getBedrock();
  if (mode === 'openai') {
    if (!compatible) compatible = createOpenAiCompatibleProvider();
    return compatible;
  }
  if (mode === 'vertex') {
    if (!vertex) vertex = createVertexProvider();
    return vertex;
  }
  return null;
}

/** Household actions and room runs use this when no caller passed a provider. */
export async function defaultServerProvider(): Promise<ServerProvider> {
  const tool = getToolModel();
  if (tool) return tool;
  const access = await resolveRoutedAccess({});
  if (isFailed(access.fallback)) {
    const reason = access.fallback.error;
    throw reason instanceof Error ? reason : new Error('No server model is configured.');
  }
  return createRoutingProvider(access);
}
