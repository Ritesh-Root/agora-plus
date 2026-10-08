# Security and auth report
Summary: The OAuth core (PKCE S256, single-use codes, HMAC, expiry, refresh scope pinned to the original grant) is in good shape, but the household is open on the network unless a passcode happens to be set, and the "ask before acting" gate is a prompt the same model can satisfy by calling `approve_action`. A development bearer with every scope is accepted in the production process, with no minimum length. I would not put this on a public URL until the passcode is required, the dev token is refused there, and the model cannot approve its own requests.

## Findings
### SEC-1 Household API is open on every interface when no passcode is set
- Severity: P0
- Area: `server/routes.ts`, `server/prod.ts`, household REST and the voice turn
- Evidence: `server/household/session.ts:23-25` `householdLockEnabled` is only `Boolean(process.env.AGORA_HOUSEHOLD_PASSCODE?.trim())`. `server/routes.ts:103-104` `if (!householdLockEnabled() || householdSessionActive(req)) return false` so a missing passcode does not refuse the route. `server/routes.ts:348-350` `DELETE` calls `deleteMemory`. `server/prod.ts:54` `server.listen(port, '0.0.0.0'`. `package.json:15` `"dev": "vite --port=3000 --host=0.0.0.0"`. `server/household/session.test.ts:128` `it('leaves the routes open when no passcode is configured'`. `README.md:71` documents the minimum setup as `AGORA_MCP_TOKEN=choose-a-long-random-string` and does not say that this leaves `/api/*` open.
- Why it matters: Anyone who can reach the port can read memory, tasks, and run documents, delete a memory with no approval, and `POST /api/approvals/:id` or `POST /api/alexa-sim/turn`. `GET /api/household` returns pending approvals, including ids. That is a data-loss bug on a LAN or Cloud Run deploy, against the privacy claim in the pitch (Technical implementation, Impact).
- Fix: If `AGORA_HOUSEHOLD_PASSCODE` is empty, bind `127.0.0.1` only (Vite and `prod.ts`) and refuse `/api/*` writes. Require the passcode before listening on `0.0.0.0`.
- Effort: S
- Confidence: high

### SEC-2 The model can approve its own forget or plan; the human check is a prompt
- Severity: P1
- Area: `server/mcp/server.ts`, `server/alexaSim/bridge.ts`, `server/household/actions.ts`
- Evidence: `server/mcp/server.ts:35` `Call approve_action with that id and decision approve or reject.` The forget tool text at `server/mcp/server.ts:191` says `Call approve_action before the fact is gone.` `server/alexaSim/bridge.ts:332-336` passes every model tool name to `connected.callTool` with no allow-list. The only wait is `server/alexaSim/conversation.ts:11` `When the user then says yes or no, call approve_action with that approvalId.` Memory is copied into the tool speech the model reads: `server/mcp/server.ts:180` `` speech: best ? `The best match is ${best.text}` ``. Web pages are concatenated into a model user turn at `server/household/actions.ts:522-523` `` `Context:\n${found.context}\n\nQuestion: ${trimmed}` `` and the spoken answer comes back to the voice loop. `ask_agora` itself only registers read tools (`server/household/actions.ts:211-242`); the voice loop registers the full MCP list (`server/alexaSim/bridge.ts:309-314`). The stored plan is larger than the card: `server/household/actions.ts:418-424` saves `brief` and `presetTasks` while `summary` is the step titles, and `src/interface/HouseholdPanel.tsx:255` renders `{approval.summary}`. `daily_briefing` returns every waiting id (`server/mcp/server.ts:325-328`).
- Why it matters: `forget` and `plan_and_run` do stop in `approvals.ts` until `resolveApproval`. Nothing in code stops the same model turn from calling `approve_action` next (the loop allows 4 steps). Injected memory or a web page can ask for that call, or for `remember` / `complete_task`, which write immediately. The person approves a title list; the run executes the model-written prompts. That breaks the pitch "ask before acting" (Technical implementation, Quality of idea).
- Fix: Do not give `approve_action` to `runToolLoop`. Call it only from `routeFast` on an exact yes/no, and from the household buttons. Stop putting `approvalId` and raw memory text in the tool payload sent back to the model. Show the task prompts on the approval card, and run only that shown list.
- Effort: M
- Confidence: high

### SEC-3 Dev token is a full MCP credential, and production does not reject a weak one
- Severity: P1
- Area: `server/mcp/oauth.ts`, `server/mcp/http.ts`, `server/alexaSim/oauthClient.ts`, `server/prod.ts`
- Evidence: `server/mcp/oauth.ts:654-660` if `AGORA_MCP_TOKEN` matches, the bearer is `scopes: [...SCOPES]` (`mcp:service`, `mcp:tools`, `mcp:resources`) and `kind: 'dev'`. `server/mcp/http.ts:197` checks audience only `if (identity.kind === 'token'`, so the dev token skips it. `server/alexaSim/oauthClient.ts:152-153` `const dev = process.env.AGORA_MCP_TOKEN?.trim(); if (dev) return { list: dev, call: dev }` after OAuth is configured but the simulator is not linked. `server/mcp/oauth.test.ts:286` `it('returns 503 for OAuth when secrets are unset and still accepts the dev token'` and the test sends `Bearer dev-token` (`server/mcp/oauth.test.ts:308`). `server/prod.ts` has no check. `README.md:71` says `choose-a-long-random-string`; the code accepts any non-empty string.
- Why it matters: The token is intentional for local Inspector and Claude Code. On a process bound to `0.0.0.0` it is also a permanent admin bearer: tools, resources, and `approve_action`, with no expiry and no audience. A short or copied test value is enough. The voice app will use it even when real OAuth is configured, as long as nobody has pressed Link (Technical implementation).
- Fix: Ignore `AGORA_MCP_TOKEN` when `AGORA_PUBLIC_URL` is set or `NODE_ENV=production`. Reject values shorter than 32 bytes. Do not fall back to it once OAuth is configured.
- Effort: S
- Confidence: high

### SEC-4 Passcode guesses are unlimited, and the consent page can be framed
- Severity: P1
- Area: `server/mcp/oauth.ts`, `server/household/session.ts`
- Evidence: `server/mcp/oauth.ts:627-629` a wrong OAuth passcode only redisplays the form (`consentPage(..., 'That passcode is not right.')`). There is no counter, delay, or lockout in `handleAuthorize`. `server/household/session.ts:12` `const FAIL_DELAY_MS = 250` and `session.ts:137-139` wait once per failed `POST /api/session`, with no failure counter. `server/mcp/oauth.ts:380-384` the consent response sets `Content-Type`, `Cache-Control`, and `X-Content-Type-Options` only. No `Content-Security-Policy` and no `X-Frame-Options`. The consent form is not tied to a cookie; `htmlPage` sets none.
- Why it matters: `POST /api/session` with the right passcode unlocks every household route (SEC-1's lock). A short passcode can be guessed in parallel; 250 ms does not stop that. A framed consent page lets a site overlay the passcode prompt. The OAuth page does not set a session cookie, so there is nothing to mark `HttpOnly`, `Secure`, or `SameSite` on that response. The household cookie, once issued, is `HttpOnly; SameSite=Strict` and `Secure` only when the socket is TLS or `X-Forwarded-Proto` is `https` (`server/household/session.ts:87-96`) (Technical implementation).
- Fix: Share one limiter (for example 5 misses, then a 15 minute block) across `/oauth/authorize` and `/api/session`. On the consent HTML, send `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Effort: S
- Confidence: high

### SEC-5 Any https URL is accepted as the OAuth redirect
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:313-314` `if (url.protocol === 'https:') return true` and http is allowed only for hostname `localhost` or `127.0.0.1`. There is no registered list in the code or in `.env.example`. `skills/agora-household/references/ALEXA_ADDON.md:84-85` says `At request time this server accepts any https redirect URI` and `Still register the full list on the Amazon side.` `docs/plan/phase-2.md:67` asked for this (`Accept only https redirect URIs, or http://localhost`). `state` is optional: `server/mcp/oauth.ts:333` only rejects an over-long value. The code is single-use and bound to the PKCE challenge (`server/mcp/oauth.ts:516-523`).
- Why it matters: OAuth for Alexa+ is supposed to match `redirect_uri` exactly against a registered list. Here the match is "whatever https URL was on the authorize request." Redeeming the code still requires the client secret (`server/mcp/oauth.ts:484`) and the PKCE verifier, so an open redirect alone does not mint a token. A leaked `AGORA_OAUTH_CLIENT_SECRET` plus a phished consent (SEC-4) does. `state` is echoed when present and not required (Technical implementation).
- Fix: Exact-match `redirect_uri` against `AGORA_OAUTH_REDIRECT_URIS`. Require `state`.
- Effort: S
- Confidence: high

### SEC-6 The passcode does not cover the proxy, the model test, or the room socket
- Severity: P1
- Area: `server/relay.ts`, `server/modelTest.ts`, `server/prod.ts`, `ws`
- Evidence: `server/prod.ts:35` `handleCorsProxy` and `handleModelTest` run before `handleApiRoutes`, and neither calls `householdLockEnabled`. `server/relay.ts:52-54` `/api/cors-proxy` has no household check; `server/relay.ts:57-60` answers `Access-Control-Allow-Origin: *`. `server/relay.ts:127-131` a non-blocked proxy error is returned as `fail(..., message)`. `server/relay.ts:187-195` the upgrade handler accepts `/__relay` with no origin or session check. `server/hub.ts:25` `new RoomState({ hostSecret: process.env.DEMO_HOST_SECRET })`. `server/roomState.ts:124-126` when that secret is empty, `isHost` is `this.players.size === 0`. `node_modules/ws/package.json:3` is `"version": "8.20.0"`. npm audit (`npm audit --omit=dev`, 2026-10-08) reports that version inside `>=8.0.0 <8.21.0` for [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) "ws: Memory exhaustion DoS from tiny fragments and data chunks". I did not reproduce the fragment attack.
- Why it matters: A household passcode still leaves an open chat-completions proxy and an open WebSocket. With no `DEMO_HOST_SECRET`, the first caller is host and can `run-society`. In Bedrock mode that uses the server model (`server/relay.ts:40-48`). The proxy forwards the caller's key and blocks private targets, but any website can call it, and upstream error text is sent back to the client. The `ws` bug is a crash of the same process that holds approvals and the linked Alexa token (Technical implementation).
- Fix: Put the proxy, model test, and `/__relay` behind the household session when a passcode is set. Require `DEMO_HOST_SECRET` on `0.0.0.0`. Upgrade `ws` to a release outside that advisory range.
- Effort: M
- Confidence: high on the missing auth; medium on the `ws` advisory (version match only)

### SEC-7 The token signing key can be a single character
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:68-73` `oauthReady` is true when `AGORA_TOKEN_SECRET` is any non-empty string. `server/mcp/oauth.ts:129-139` `createHmac('sha256', secret)` signs access tokens, refresh tokens, and (via `server/household/session.ts:37-40`) the household cookie. No minimum length.
- Why it matters: Anyone who has seen one token can try short secrets offline and forge a bearer with `mcp:tools` and `mcp:resources`, or a household cookie. That is full tool access and the approval tool (Technical implementation).
- Fix: Refuse startup when `AGORA_TOKEN_SECRET` is shorter than 32 bytes.
- Effort: S
- Confidence: high

### SEC-8 Vite 6.4.1 is in range for a dev-server file-read advisory
- Severity: P1
- Area: Vite dev server (`package.json` script)
- Evidence: `node_modules/vite/package.json:3` `"version": "6.4.1"`. `package.json:15` starts it with `--host=0.0.0.0`. npm audit reports that version inside `>=6.0.0 <=6.4.1` for [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) "Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket". I did not reproduce the read. The Windows-only Vite advisories in the same audit are out of scope on this Linux host.
- Why it matters: The hackathon demo command is `npm run dev`, bound to every interface. A file-read on that server would include `.env` (OAuth secret, token secret, passcode, API keys). `server/prod.ts` does not use Vite (Technical implementation).
- Fix: Upgrade Vite past the advisory range before anyone runs `npm run dev` on a shared network. Bind the dev server to `127.0.0.1` until then.
- Effort: S
- Confidence: medium

### SEC-9 A reused refresh token does not revoke the replacement
- Severity: P2
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:548-566` the presented `jti` is deleted, a missing record returns `invalid_grant` ("already been used or has expired"), and a new refresh token is stored for the same `saved.scope`. Nothing walks the other refresh records for that client. Scope is copied from `saved.scope` (`server/mcp/oauth.ts:558-564`); the request cannot widen it. The replay test expects only the old token to fail (`server/mcp/oauth.test.ts:238-243`).
- Why it matters: Rotation and reuse detection work for the stolen token itself. If a thief refreshes first, their new token keeps working after the household sees `invalid_grant`. User impact is a stolen refresh that survives the alarm (Technical implementation).
- Fix: On reuse (`payload` valid, `jti` absent or already deleted), drop every refresh record for that `sub` and treat outstanding access tokens for that client as dead.
- Effort: M
- Confidence: high

### SEC-10 Audience follows the Host header unless AGORA_PUBLIC_URL is set
- Severity: P2
- Area: `server/mcp/oauth.ts`, `server/mcp/http.ts`
- Evidence: `server/mcp/oauth.ts:94-103` `publicBase` uses `AGORA_PUBLIC_URL` when set; otherwise `Host` and `X-Forwarded-Proto`. `server/mcp/http.ts:197-199` accepts a token when `resourcesMatch(identity.audience, mcpResourceUrl(req))`, and `mcpResourceUrl` uses that same base. Dev tokens skip this check (SEC-3).
- Why it matters: With the public URL unset, a client chooses the issuer and the audience by sending `Host`. A token minted with that host works on the next request that repeats it. Alexa+ discovery is only pinned after `AGORA_PUBLIC_URL` is set, which `ALEXA_ADDON.md` already tells the operator to do (Technical implementation).
- Fix: Refuse OAuth and `/mcp` when `AGORA_PUBLIC_URL` is unset and the process is not bound to loopback. Ignore `X-Forwarded-Proto` unless a proxy flag is set.
- Effort: S
- Confidence: high

### SEC-11 The household UI deletes memory with no approval
- Severity: P2
- Area: `server/routes.ts`, `server/household/actions.ts`
- Evidence: `server/household/actions.ts:154-156` `/** UI delete. Does not ask for approval. */` then `removeMemory`. `server/routes.ts:348-350` `DELETE /api/memory/:id` calls `deleteMemory`. MCP `forget` goes through `requestApproval` (`server/household/actions.ts:133`).
- Why it matters: A logged-in browser, or anyone when SEC-1 applies, can remove a fact in one request. The voice path's approval step does not cover this door (Design, Technical implementation).
- Fix: Route UI deletes through `forget` and `resolveApproval`, and keep the Delete button as the human yes.
- Effort: S
- Confidence: high

### SEC-12 The SSRF guard checks DNS, then fetches the name again
- Severity: P2
- Area: `server/proxyGuard.ts`, `server/relay.ts`, `server/research/readUrl.ts`
- Evidence: `server/proxyGuard.ts:52-56` `lookup` must not return a private address, then the function returns the URL. `server/relay.ts:107-116` `fetch(url)` uses that hostname, with `redirect: 'error'`. `server/research/readUrl.ts:12-13` checks the URL, then requests `https://r.jina.ai/${url.toString()}`. `server/research/firecrawl.ts:30` posts only to `https://api.firecrawl.dev/v2/search`. I did not run a rebinding test.
- Why it matters: Private, loopback, and link-local addresses are refused, including `169.254.169.254` (`server/proxyGuard.ts:19`). A name that is public at the check and private at the fetch can still be reached from the CORS proxy and the model test. Page reads are sent to Jina, so the household network is not the one connecting to the page (Technical implementation).
- Fix: Connect to the addresses returned by the check (or re-resolve and abort if any address is private). Keep `redirect: 'error'`.
- Effort: M
- Confidence: medium

## What is good (keep)
- PKCE is S256 only (`server/mcp/oauth.ts:340`), codes are `randomBytes(32)`, live 5 minutes, and are deleted before use (`server/mcp/oauth.ts:516-518`, `CODE_MS` at line 17).
- Client secrets and HMAC signatures use `timingSafeEqual` (`server/mcp/oauth.ts:80-87`, `247-251`, `161-162`). Access tokens expire (`server/mcp/oauth.ts:169`) and a refresh token cannot be used as a bearer (`typ` check at `server/mcp/oauth.ts:663`).
- Refresh re-issues `saved.scope` only (`server/mcp/oauth.ts:558-564`). `client_credentials` always gets `mcp:service` (`server/mcp/oauth.ts:505-507`).
- `/mcp` body limit is 1 MiB (`server/mcp/http.ts:13`). A JSON-RPC batch is classified as needing `mcp:tools` (`server/mcp/http.ts:123`). Browser `Origin` must be localhost or `AGORA_PUBLIC_URL` (`server/mcp/http.ts:71-88`). A missing token is an empty 401 with no `WWW-Authenticate` (`server/mcp/http.ts:63-68`).
- Approval ids are `randomUUID()` (`server/household/approvals.ts:51`), expire after 10 minutes (`approvals.ts:18`, `38-40`), and `resolveApproval` runs the stored payload, not client-supplied arguments (`approvals.ts:63-81`). The status is set to `approved` before the handler, so a second call gets `resolved`.
- Data files reject absolute paths, `..`, and more than two segments (`server/household/store.ts:23-29`). Run documents require a UUID (`server/runEngine.ts:228`, `server/routes.ts:29`).
- Household panel text is React children (`src/interface/HouseholdPanel.tsx:210`, `234`, `255`). The simulator renders speech as text (`src/alexa/ReceiptCard.tsx:53`). The MCP card assigns `textContent` (`server/mcp/apps/householdCard.ts:171-177`, `196`). No `dangerouslySetInnerHTML` in those surfaces. The card HTML has no CSP meta tag (`server/mcp/apps/householdCard.html`); user strings still go through `textContent`.
- The CORS proxy requires a caller key, does not add a server key (`server/relay.ts:78-83`, `108-110`), and limits targets to public https URLs whose path ends in `/chat/completions` (`server/proxyGuard.ts:59-67`).
- OAuth and session code paths I read do not log the passcode, client secret, or bearer. Bridge errors drop messages that look like keys (`server/alexaSim/bridge.ts:32-35`). REST 500s return `The request failed.` (`server/routes.ts:437-438`).

## Scrape log (web members only)
Not a web member. No pages fetched. Dependency notes are from `npm audit --omit=dev` on 2026-10-08 and the installed `package.json` versions above.
