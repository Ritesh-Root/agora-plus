# Your task: Security and auth reviewer (prefix SEC)
Write your report to `docs/council/reports/q1-security.md`. You may run `npm audit --omit=dev` (read-only). No other commands besides reading files and read-only git.

Scope: `server/mcp/oauth.ts`, `server/mcp/http.ts`, `server/mcp/server.ts`, `server/mcp/apps/*`, `server/routes.ts`,
`server/household/*` (especially `session.ts`, `store.ts`, `approvals.ts`, `actions.ts`), `server/runEngine.ts`,
`server/alexaSim/*` (especially `oauthClient.ts`, `bridge.ts`), `server/llm/toolLoop.ts`, `server/research/*`,
`server/proxyGuard.ts`, `server/relay.ts` (CORS proxy, model test, API route wiring), `server/prod.ts`, `src/interface/HouseholdPanel.tsx`, `src/alexa/*`.

Check at least:
1. OAuth for Alexa+ (the requirements are summarised in `docs/plan/ROADMAP.md` and `skills/agora-household/references/ALEXA_ADDON.md`):
   PKCE S256 only, auth codes single-use and short-lived, exact `redirect_uri` match against a registered list, `state`,
   timing-safe comparison of client secrets and token signatures, expiry enforced, `resource`/audience checked,
   refresh tokens cannot widen scopes, refresh rotation or reuse handling, signing key strength and where it comes from.
2. `/oauth/authorize` passcode page: brute-force limits, CSRF, clickjacking (frame headers), cookie flags (HttpOnly, Secure, SameSite).
3. `/mcp` front door: Origin allowlist, Host header / DNS rebinding for a server on localhost, scope checks per JSON-RPC method,
   batch requests, body size limits, what the dev token can do and whether production refuses a weak or default token.
4. REST `/api/*`: CSRF on writes, auth when a passcode is set, error messages that leak internals.
5. Path traversal or injection through run ids, memory ids, approval ids, file names in `.agora-data`.
6. Approvals: are ids guessable, single-use, bound to the action and arguments that were shown, expired correctly? Can a caller
   approve something it did not request? Can a tool call approve itself?
7. Prompt injection: web pages from `web_research` and stored memory text flow into the Bedrock tool loop. Can injected text
   make the model call write tools or `approve_action` without a human? Is the approval gate enforced in code, not in the prompt?
8. XSS: memory text, task text and run documents rendered in `HouseholdPanel`, the simulator and the MCP Apps `ui://` card (CSP?).
9. SSRF through the CORS proxy, Firecrawl/Exa research, or any user-supplied URL.
10. Secrets: anything logged, returned in errors, or written to disk that should not be.
