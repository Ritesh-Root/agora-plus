# Phase 2: MCP server (spec 2025-11-25, Streamable HTTP) and OAuth

Goal: expose the household as a self-hosted MCP server that Alexa+, Claude and ChatGPT can all call. This is the core
requirement of the Alexa+ track: "a self-hosted MCP server (spec 2025-11-25 or later, Streamable HTTP)".

## Packages
`npm install @modelcontextprotocol/server@^2.3.1 @modelcontextprotocol/node@^2.1.1 zod@^4.2` and
`npm install -D @modelcontextprotocol/client@^2.3.1`. Do not add `@modelcontextprotocol/sdk`.

Before writing code, read the type definitions:
- `node_modules/@modelcontextprotocol/server/dist/*.d.mts` — `McpServer`, `createMcpHandler`, `registerTool`,
  `registerResource`, `ResourceTemplate`, `registerPrompt`, and how `authInfo` reaches tool callbacks.
- `node_modules/@modelcontextprotocol/node/dist/*.d.mts` — `toNodeHandler` and how auth info passes from a Node request
  (if it reads `req.auth`, set that; otherwise call `handler.fetch(request, { authInfo })` yourself).
- `node_modules/@modelcontextprotocol/client/dist/*.d.mts` — `Client`, `StreamableHTTPClientTransport` (for tests).
Reference: https://ts.sdk.modelcontextprotocol.io/v2/serving/http — `createMcpHandler(factory, { legacy: 'stateless' })`
builds a fresh `McpServer` per request; wrap with `toNodeHandler`. The handler checks no Origin and no token, so we do.

## Files

1. `server/mcp/server.ts` — `buildAgoraMcpServer(ctx)` returns an `McpServer({ name: 'agora-plus', version })`
   with instructions saying what AGORA+ is and the approval protocol. Tools are thin wrappers over
   `server/household/actions.ts` (and `server/runEngine.ts` for run status). Never put logic here that REST also needs.
   Every tool result: a `text` content block containing the short `speech`, plus `structuredContent`
   `{ speech, status: 'ok' | 'needs_approval' | 'error', receipt?, approvalId?, ...tool-specific fields }` validated by a
   zod `outputSchema`. Errors return `isError: true` with a helpful `speech`; never an empty result.
   Each description says when to call the tool, why, and what it returns, in voice-friendly terms.

   | Tool | Input | Notes | Annotations |
   |---|---|---|---|
   | `remember` | `fact`, `tags?` | adds household memory; returns receipt | not destructive |
   | `recall` | `query?` | top matches; speech names the best one | readOnly |
   | `forget` | `memoryId?` or `query?` | returns `needs_approval` + `approvalId`; never deletes directly | destructive |
   | `add_task` | `title`, `due?` | receipt | not destructive |
   | `list_tasks` | `status?` | | readOnly |
   | `complete_task` | `taskIdOrTitle` | idempotent | idempotent |
   | `daily_briefing` | none | from `briefing.ts`, no model call | readOnly |
   | `plan_and_run` | `goal` | Phase 2: create the `start_run` approval with a fixed-text preview; returns `needs_approval` | not destructive |
   | `get_run_status` | `runId?` | latest run if omitted; includes a `resource_link` to `agora://runs/{runId}/document` when finished | readOnly |
   | `approve_action` | `approvalId`, `decision: 'approve' \| 'reject'` | executes via `resolveApproval` | destructive |
   | `ask_agora` | `question` | Phase 2 stub: answer from `recall` results with no model call; Phase 3 makes it real | readOnly |
   | `web_research` | `question` | Phase 2 stub returning status `error` "not configured yet"; Phase 3 makes it real | readOnly, openWorld |

   Resources: `agora://memory` (text/markdown from `memoryMarkdown()`), `agora://tasks` (application/json),
   `agora://runs/{runId}/document` (a `ResourceTemplate` with a list callback over `listRecentRuns`).
   Prompts: `morning-briefing` (no args) and `plan-a-week-of-meals` (`people`, `constraints?`).
   Tools that do not need a model must not call one: Alexa+ expects fast round trips (under 500 ms).

2. `server/mcp/oauth.ts` — a small OAuth 2.1 authorization server for one household.
   Follow https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html:
   - `GET /.well-known/oauth-authorization-server`: `issuer`, `authorization_endpoint`, `token_endpoint`,
     `grant_types_supported: ['client_credentials', 'authorization_code', 'refresh_token']`,
     `response_types_supported: ['code']`, `code_challenge_methods_supported: ['S256']`,
     `token_endpoint_auth_methods_supported: ['client_secret_basic']`, `scopes_supported: ['mcp:service', 'mcp:tools', 'mcp:resources']`.
   - `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`:
     `resource` = `${AGORA_PUBLIC_URL || request origin}/mcp`, `authorization_servers`, `scopes_supported`.
   - `POST /oauth/token` (form-encoded):
     - `client_credentials`: client authenticated with HTTP Basic only (`AGORA_OAUTH_CLIENT_ID` / `AGORA_OAUTH_CLIENT_SECRET`,
       timing-safe compare); if a `resource` parameter is sent it must equal our `/mcp` URL; returns scope `mcp:service`.
     - `authorization_code` with PKCE S256 (code single-use, 5-minute life, `redirect_uri` must match) → access token with
       `mcp:tools mcp:resources` plus a refresh token.
     - `refresh_token` → new access token (rotate the refresh token).
     - Access tokens: HMAC-SHA256 signed with `AGORA_TOKEN_SECRET` (`base64url(payload).base64url(sig)`, payload
       `{ sub, scope, aud, exp }`), `expires_in` ≤ 3600. OAuth errors use the standard JSON error shape.
   - `GET /oauth/authorize`: a minimal HTML consent page (inline CSS, no framework) asking for the household passcode
     (`AGORA_HOUSEHOLD_PASSCODE`); `POST /oauth/authorize` checks it (timing-safe) and redirects to `redirect_uri` with `code` and `state`.
     Accept only `https` redirect URIs, or `http://localhost` / `http://127.0.0.1` for development.
   - `verifyBearer(header)` → `{ clientId, scopes, kind: 'token' | 'dev' } | null`. Also accepts the static
     `AGORA_MCP_TOKEN` (development) with all scopes. If `AGORA_OAUTH_CLIENT_*` or `AGORA_TOKEN_SECRET` are unset, the
     OAuth endpoints answer 503 with a clear message and only the dev token works. Never log tokens or secrets.

3. `server/mcp/http.ts` — `handleMcpRoutes(req, res): boolean` for `/mcp`, `/oauth/*` and `/.well-known/oauth-*`.
   For `/mcp`:
   - Origin: no `Origin` header is fine (server-to-server). Otherwise its hostname must be `localhost`, `127.0.0.1`, or the
     hostname of `AGORA_PUBLIC_URL`; else 403.
   - Missing or invalid token → `401` with an empty body and **no** `WWW-Authenticate` header (Alexa+ requires this).
   - Scopes: `initialize`, `tools/list`, `resources/list`, `prompts/list` and pings need any valid token. `tools/call` needs
     `mcp:tools`; `resources/read` needs `mcp:resources`; the dev token has both. For a JSON-RPC batch or anything you cannot
     classify, require `mcp:tools`. (Read the JSON body once, then hand the parsed body to the SDK handler — check the
     `.d.mts` for how to pass a pre-parsed body; if it cannot take one, rebuild a `Request` from the buffered body.)
   - Pass auth info into the handler so tools can see `clientId`.
   Mount `handleMcpRoutes` in `relayPlugin()` and `server/prod.ts` next to `handleApiRoutes`.

4. Tests (`server/mcp/mcp.test.ts`, `server/mcp/oauth.test.ts`) — start `http.createServer` on port 0 with the real
   route handlers and a temp data dir; use `@modelcontextprotocol/client` `Client` + `StreamableHTTPClientTransport`
   with an `Authorization` header. Cover:
   - `/mcp` without a token → 401, empty body, no `WWW-Authenticate`.
   - `initialize` succeeds and the negotiated protocol version is `2025-11-25` or newer.
   - `tools/list` includes all 12 tools with output schemas.
   - `remember` then `recall` round trip; the receipt is `verified: true`.
   - `forget` → `needs_approval` → `approve_action` approve → memory gone.
   - A client-credentials token (scope `mcp:service`) can list tools but `tools/call` is refused.
   - Token endpoint: Basic auth required; wrong secret → `invalid_client`; PKCE flow end to end (authorize POST with
     passcode → code → token); expired token rejected; tampered token rejected.

## Acceptance
- The full gate passes.
- With `npm run dev` running and dev env vars exported in that shell (`AGORA_MCP_TOKEN=dev-token` etc.):
  ```
  curl -si -X POST localhost:3000/mcp -H 'content-type: application/json' -d '{}' | head -5      # 401, no WWW-Authenticate
  curl -s localhost:3000/.well-known/oauth-authorization-server
  curl -s -X POST localhost:3000/mcp -H "authorization: Bearer dev-token" -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
  ```
  Paste the trimmed output into `docs/FRICTION_LOG.md` only if something surprised you; otherwise into `docs/HACKATHON_CHANGES.md`.
  Stop the dev server afterwards.
