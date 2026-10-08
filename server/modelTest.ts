import type { IncomingMessage, ServerResponse } from 'http';
import { householdLockEnabled, householdSessionActive } from './household/session';
import { resolveModelAccess } from './modelAccess';
import { publicModelError } from './modelError';
import { assertPublicHttpsTarget, fetchPinned, MAX_PROXY_BODY } from './proxyGuard';
import { isNvidiaTarget, requestModel, requestOptions } from './society/provider';

function chatUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/$/, '');
  return root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
}

function sendJson(res: ServerResponse, status: number, body: { ok?: true; error?: string }): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Checks one saved connection. The response never includes a key. */
export function handleModelTest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = (req.url ?? '').split('?')[0];
  if (pathname !== '/api/model-test') return false;
  if (householdLockEnabled() && !householdSessionActive(req)) {
    if (typeof req.resume === 'function') req.resume();
    sendJson(res, 401, { error: 'household_locked' });
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_PROXY_BODY) {
      sendJson(res, 413, { error: 'The model service could not be reached.' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    void (async () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { baseUrl?: unknown; apiKey?: unknown; model?: unknown };
        const model = typeof parsed.model === 'string' ? parsed.model.trim() : '';
        const baseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : '';
        const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
        if (!model) {
          sendJson(res, 400, { error: 'Add a model ID.' });
          return;
        }
        if (!apiKey) {
          sendJson(res, 400, { error: 'Add an API key for that model endpoint.' });
          return;
        }
        const access = await resolveModelAccess({ apiKey, baseUrl: baseUrl || undefined });
        const isNvidia = isNvidiaTarget(access.apiKey, access.baseUrl);
        const sentModel = requestModel(model, isNvidia);
        const payload: Record<string, unknown> = {
          model: sentModel,
          messages: [{ role: 'user', content: 'Reply with ok.' }],
          ...(isNvidia ? {} : { max_tokens: 16 }),
          ...requestOptions(sentModel, isNvidia),
        };
        const fallbackBase = isNvidia ? 'https://integrate.api.nvidia.com/v1' : 'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1';
        const target = await assertPublicHttpsTarget(chatUrl(access.baseUrl || fallbackBase));
        const response = await fetchPinned(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`Inference API error (${response.status})`);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const status = message.match(/Inference API error \((\d+)\)/);
        const clear = message.startsWith('Add an API key')
          || message === 'Only https targets are allowed'
          || message === 'Target host is not allowed'
          || message === 'Invalid target URL'
          || message === 'Add a model ID.';
        const code = status?.[1];
        const errorText = code === '401' || code === '403'
          ? 'The API key was rejected.'
          : code === '404'
            ? 'That model is not available.'
            : code
              ? `The model endpoint returned HTTP ${code}.`
              : (clear ? message : publicModelError(error));
        sendJson(res, 400, { error: errorText });
      }
    })();
  });
  return true;
}
