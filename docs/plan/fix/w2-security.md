# Your task: W2 security (lock the household, fix OAuth, upgrade dependencies)
Agent id: `w2-security`. Read `docs/council/reports/q1-security.md` (all SEC findings), `g4-spec-followup.md` (SPEC-1, SPEC-5,
SPEC-6), `q2-architecture.md` (ARC-4, ARC-5), `g3-judge-spec.md` (JDG-7, JDG-9).

1. SEC-1 / JDG-9: with no `AGORA_HOUSEHOLD_PASSCODE`, the household must not be open to the network. `npm run dev` binds
   `127.0.0.1` by default (add a `dev:lan` script for `0.0.0.0`). `server/prod.ts` binds `0.0.0.0` only when a passcode is set
   (Cloud Run and ECS deploys must still work with a passcode); without one it binds `127.0.0.1` and logs why. As a second
   layer, `/api/*` household routes refuse requests whose socket address is not loopback when no passcode is set.
2. SEC-3: ignore `AGORA_MCP_TOKEN` when `NODE_ENV=production` or `AGORA_PUBLIC_URL` is an https URL, unless
   `AGORA_ALLOW_DEV_TOKEN=1`. Reject dev tokens shorter than 32 characters (log once, never print the value). The simulator
   (`oauthClient.ts`) must not fall back to the dev token once OAuth is configured.
3. SEC-7: refuse OAuth (503 with a clear log line) when `AGORA_TOKEN_SECRET` is shorter than 32 characters.
4. SEC-5 / SPEC-1 / JDG-7: exact-match `redirect_uri` against `AGORA_OAUTH_REDIRECT_URIS` (comma-separated). Always allow
   the simulator's own loopback callback. Require `state`.
5. SPEC-5: accept client credentials in HTTP Basic or in the form body (`client_id` + `client_secret`), never both.
6. SEC-4: one shared limiter for wrong passcodes on `/oauth/authorize` and `/api/session` (5 misses per IP, then 15 minutes,
   429 with a plain message). Consent page: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
7. SEC-6: when a passcode is set, the CORS proxy, the model test and the `/__relay` WebSocket upgrade require the household
   session cookie. Require `DEMO_HOST_SECRET` when binding `0.0.0.0` (or make the host the household session). Keep the office
   working on localhost with no configuration.
8. SEC-8 and the `ws` advisory: upgrade `vite` to the newest 6.x that `npm audit` no longer flags (do not jump a major) and
   `ws` to >= 8.21.0. Run `npm install` for that, then `npm audit --omit=dev` and paste the summary into your notes.
9. ARC-4 / SPEC-6: persist OAuth refresh records (and the simulator's linked-account record) under `AGORA_DATA_DIR` with the
   existing atomic store helpers, so a restart does not log Alexa+ out. SEC-9: on refresh-token reuse, revoke every refresh
   record for that subject.
10. SEC-10: when `AGORA_PUBLIC_URL` is unset and the process is not on loopback, refuse OAuth and `/mcp` with a clear error;
    ignore `X-Forwarded-Proto` unless `AGORA_TRUST_PROXY=1`. SEC-12: make the SSRF guard connect only to the addresses it
    checked (or re-check right before connect).
11. ARC-5: every env var the server reads is in `.env.example` with a one-line comment (`DEMO_HOST_SECRET`, `SOCIETY_REPLAY`,
    `BENCH_REPLAY`, `DISABLE_HMR`, and the new ones above).
12. Tests for each item (oauth.test.ts, session tests, routes tests, http tests). Existing tests that encode the old open
    behaviour must be updated to the new rule, not deleted.
