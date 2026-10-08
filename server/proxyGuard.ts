import type { LookupOptions } from 'node:dns';
import { lookup as lookupAll } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const MAX_PROXY_BODY = 1_000_000;

/** True for loopback, private, link-local, and CGNAT addresses. */
export function isPrivateAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized === '0.0.0.0') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  const parts = normalized.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await lookupAll(hostname, { all: true });
  return records.map((record) => record.address);
}

const pins = new WeakMap<URL, readonly string[]>();

function rememberPin(url: URL, addresses: readonly string[]): URL {
  pins.set(url, addresses);
  return url;
}

/** Addresses the guard already accepted for this URL object. */
export function pinnedAddresses(url: URL): readonly string[] | undefined {
  return pins.get(url);
}

/** DNS lookup that can return only the addresses the guard checked. */
export function pinLookup(addresses: readonly string[]) {
  const list = addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  return (_hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) => {
    if (options.all) {
      callback(null, list);
      return;
    }
    callback(null, list[0]?.address ?? '', list[0]?.family ?? 4);
  };
}

export interface PinnedRequest {
  url: URL;
  addresses: readonly string[];
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  signal?: AbortSignal;
}

/** Test hook. Production connects with `pinLookup`. */
export type PinnedTransport = (request: PinnedRequest) => Promise<Response>;

function defaultPinnedTransport(request: PinnedRequest): Promise<Response> {
  const { url, addresses, method, headers, body, signal } = request;
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: method ?? 'GET',
      headers,
      servername: url.hostname,
      lookup: pinLookup(addresses),
    }, (res) => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400) {
        res.resume();
        reject(new Error('redirect'));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') responseHeaders.set(key, value);
          else if (Array.isArray(value)) responseHeaders.set(key, value.join(', '));
        }
        resolve(new Response(Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    const fail = (error: unknown) => reject(error instanceof Error ? error : new Error('request failed'));
    req.on('error', fail);
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')));
    signal?.addEventListener('abort', () => req.destroy(signal.reason instanceof Error ? signal.reason : new Error('aborted')), { once: true });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Connects to the addresses recorded by the guard. A URL that was not checked
 * is refused. Redirects are errors.
 */
export function fetchPinned(url: URL, init: Omit<PinnedRequest, 'url' | 'addresses'> = {}, transport: PinnedTransport = defaultPinnedTransport): Promise<Response> {
  const addresses = pins.get(url);
  if (!addresses || addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return Promise.reject(new Error('Target host is not allowed'));
  }
  return transport({ url, addresses, ...init });
}

/** HTTPS only, and the host must not resolve to a private or loopback address. */
export async function assertPublicHttpsTarget(
  raw: string,
  resolve: (hostname: string) => Promise<string[]> = defaultResolve,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid target URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only https targets are allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Target host is not allowed');
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error('Target host is not allowed');
  }
  const ips = await resolve(host);
  if (ips.length === 0 || ips.some(isPrivateAddress)) {
    throw new Error('Target host is not allowed');
  }
  return rememberPin(url, ips);
}

/** Chat-completions proxy target. Not a general open proxy. */
export async function assertChatProxyTarget(
  raw: string,
  resolve: (hostname: string) => Promise<string[]> = defaultResolve,
): Promise<URL> {
  const url = await assertPublicHttpsTarget(raw, resolve);
  if (!url.pathname.endsWith('/chat/completions')) {
    throw new Error('Target host is not allowed');
  }
  return url;
}

/** Public http or https. Private, loopback, and link-local hosts are refused. */
export async function assertPublicWebTarget(
  raw: string,
  resolve: (hostname: string) => Promise<string[]> = defaultResolve,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid target URL');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('Only public http(s) targets are allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Target host is not allowed');
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error('Target host is not allowed');
  }
  const ips = await resolve(host);
  if (ips.length === 0 || ips.some(isPrivateAddress)) {
    throw new Error('Target host is not allowed');
  }
  return rememberPin(url, ips);
}
