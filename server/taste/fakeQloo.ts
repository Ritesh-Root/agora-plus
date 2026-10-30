import type { QlooCaller, QlooRawResult, QlooReadiness } from './qlooClient';

/**
 * A scripted stand-in for `qloo mcp`, for tests. `handle` receives each call and returns the
 * harness envelope fields (status, results, ...) or throws. Calls are recorded in order.
 */
export interface FakeQloo extends QlooCaller {
  calls: { tool: string; args: Record<string, unknown> }[];
  maxConcurrent: number;
}

export function fakeQloo(
  handle: (tool: string, args: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
  readiness: QlooReadiness = 'ready',
): FakeQloo {
  let active = 0;
  const fake: FakeQloo = {
    calls: [],
    maxConcurrent: 0,
    async callTool(tool: string, args: Record<string, unknown>): Promise<QlooRawResult> {
      fake.calls.push({ tool, args });
      active += 1;
      fake.maxConcurrent = Math.max(fake.maxConcurrent, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const body = await handle(tool, args);
        const results = Array.isArray(body.results) ? body.results : [];
        return {
          structuredContent: { status: 'ok', summary: '', result_count: results.length, ...body, results },
          isError: body.status === 'error',
        };
      } finally {
        active -= 1;
      }
    },
    async readiness() {
      return readiness;
    },
  };
  return fake;
}

/** A Qloo-shaped entity, as compactEntity in the harness returns it. */
export function entity(id: string, name: string, properties: Record<string, unknown> = {}): Record<string, unknown> {
  return { entity_id: id, name, type: 'urn:entity:movie', properties };
}
