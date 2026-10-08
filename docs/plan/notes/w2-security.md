# W2 security

## What changed

- `package.json`: `npm run dev` binds `127.0.0.1`. `npm run dev:lan` binds `0.0.0.0`. `vite` is 6.4.4 (devDependency only; npm dropped the duplicate production entry). `ws` is 8.22.0.
- `package-lock.json`: lockfile for those installs.
- `server/prod.ts`: listens on `0.0.0.0` only when `AGORA_HOUSEHOLD_PASSCODE` is set. Otherwise `127.0.0.1`, and the log says why. Importing the file from tests does not listen.
- `server/household/session.ts`: shared passcode limiter (5 misses, then 15 minutes, 429). `X-Forwarded-Proto` sets the Secure cookie only when `AGORA_TRUST_PROXY=1`. Helpers for loopback checks.
- `server/routes.ts`: with no passcode, every `/api/*` household route returns 403 unless the socket address is loopback. Loopback with no passcode still serves the household.
- `server/hub.ts`: records the listen address. An open bind without `DEMO_HOST_SECRET` does not give the room to the first caller.
- `server/roomState.ts`: on that open bind, the host seat is the household session (`sessionHost`), not the first join.
- `server/relay.ts`: with a passcode, `/api/cors-proxy` and the `/__relay` upgrade require the household cookie. The proxy connects through `fetchPinned`. Vite notes its bind host.
- `server/modelTest.ts`: same cookie check. The model call uses `fetchPinned` after the guard.
- `server/proxyGuard.ts`: the guard remembers the addresses it accepted. `fetchPinned` connects only to those addresses and treats a redirect as an error.
- `server/mcp/oauth.ts`: dev token ignored under 32 characters, and ignored when `NODE_ENV=production` or `AGORA_PUBLIC_URL` is https, unless `AGORA_ALLOW_DEV_TOKEN=1`. OAuth returns 503 when `AGORA_TOKEN_SECRET` is shorter than 32 characters. `redirect_uri` must match `AGORA_OAUTH_REDIRECT_URIS` exactly; the simulator's own `http://127.0.0.1` or `http://localhost` callback is always allowed. `state` is required. Client secret is accepted in HTTP Basic or the form body, never both. Consent HTML sends `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. Wrong passcodes use the shared limiter. Refresh records persist in `oauth-refreshes.json` under `AGORA_DATA_DIR`. Reusing a refresh token revokes every refresh record for that subject and bumps a generation counter so later access tokens for that subject fail. OAuth and `/mcp` return 503 when `AGORA_PUBLIC_URL` is unset and the process is not bound to loopback. `X-Forwarded-Proto` is ignored unless `AGORA_TRUST_PROXY=1`.
- `server/mcp/http.ts`: `/mcp` uses that public-URL check and loads refresh records before it trusts a bearer.
- `server/alexaSim/oauthClient.ts`: no dev-token fallback once OAuth is configured. The linked account is saved as `oauth-sim-account.json` and loaded again after a restart.
- `vite.config.ts`: forwards `DEMO_HOST_SECRET`, `SOCIETY_REPLAY`, `BENCH_REPLAY`, and `DISABLE_HMR` from `.env` into the dev server.
- `.env.example`: documents `DEMO_HOST_SECRET`, `SOCIETY_REPLAY`, `BENCH_REPLAY`, `DISABLE_HMR`, `PORT`, `AGORA_TRUST_PROXY`, `AGORA_OAUTH_REDIRECT_URIS`, `AGORA_ALLOW_DEV_TOKEN`, and the production dev-token rule. Removed the `QWEN_BASE_URL` / `QWEN_MODEL` lines because the server does not read them.

Tests updated for the new rules, not removed: `server/household/session.test.ts`, `server/routes.test.ts`, `server/mcp/oauth.test.ts`, `server/mcp/mcp.test.ts`, `server/alexaSim/bridge.test.ts`, `server/alexaSim/tts.test.ts`, `server/proxyGuard.test.ts`, `server/roomState.test.ts`. New: `server/mcp/http.test.ts`, `server/prod.test.ts`, `server/alexaSim/oauthClient.test.ts`, `server/relay.auth.test.ts`.

## Finding IDs closed

SEC-1, JDG-9, SEC-3, SEC-4, SEC-5, SPEC-1, JDG-7, SPEC-5, SEC-6, SEC-7, SEC-8, SEC-9, SEC-10, ARC-4, SPEC-6, ARC-5.

SEC-12 is closed for the CORS proxy and the model test. See needs below for the other fetch sites.

## Contracts

- `GET /api/household` is unchanged. On loopback, with no passcode, it still returns `{ memory, tasks, pendingApprovals, recentRuns, suggestions }`.
- From any other socket address, that route is 403 until `AGORA_HOUSEHOLD_PASSCODE` is set.
- When a passcode is set, `/api/cors-proxy`, `/api/model-test`, and `/__relay` need the `agora_household` cookie. Localhost with no passcode and no `DEMO_HOST_SECRET` still makes the first office join the host.

## Needs from others

- Docs: README still says `npm run dev` binds `0.0.0.0` and that any `AGORA_MCP_TOKEN` is enough. Deploy docs should mention the passcode bind, `AGORA_OAUTH_REDIRECT_URIS`, the 32-character secrets, and `AGORA_PUBLIC_URL` on a public process.
- `server/modelAccess.ts` returns `url.toString()`, and `server/society/provider.ts` then fetches that name. `server/research/readUrl.ts` checks the URL and then requests Jina. Those files are not mine. `fetchPinned` connects only to the checked addresses; it has to be called with the same URL object the guard returned.
- `QWEN_BASE_URL` and `QWEN_MODEL` are still unread. I removed them from `.env.example`. Reading them belongs in the model client.
- Test fixtures now use a 32-character `AGORA_MCP_TOKEN` and `AGORA_TOKEN_SECRET` in `server/mcp/mcp.test.ts` and `server/alexaSim/bridge.test.ts`. `server/alexaSim/tts.test.ts` sets the socket to `127.0.0.1`. Shortening those, or dropping the socket, fails the suite.
- With a passcode set, the office socket will not open until the browser has the household cookie. The voice UI may need to show the passcode step before the room connects.

## npm audit --omit=dev

vite 6.4.4 and ws 8.22.0 are not in this report.

```
6 vulnerabilities (1 low, 1 moderate, 4 high)

@babel/core <=7.29.0 (GHSA-4x5r-pxfx-6jf8)
baseline-browser-mapping >=2.0.0 <2.11.0 (GHSA-w5vr-8v7q-w6rv) moderate
browserslist <=4.28.6 (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g) high
nanoid <=3.3.17 (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w) high
postcss <=8.5.22 (GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849) high
source-map-js 1.0.0 - 1.2.1 (GHSA-68fv-2mgg-jv7q) high
```

`npm audit` says `npm audit fix` would address them. I did not run that. It is outside the Vite and `ws` advisories.

## Friction

- Task: root `npm run lint`. Expected: `server/` excluded by the root tsconfig. Actual: `vite.config.ts` imports the relay, so root `tsc` still typechecks the server, and that program is not `strict`. `if (!creds.ok)` did not narrow there. Workaround: `creds.ok === false`.
- Task: `npm install vite@6.4.4`. Expected: both `dependencies` and `devDependencies` entries updated. Actual: npm removed `dependencies.vite` because the same package is a devDependency. Workaround: left it as a devDependency. `npm run build` still finds Vite. The Dockerfile runs `npm ci` before `NODE_ENV=production`.
- Task: household routes on loopback stay open with no passcode. Expected: existing fake requests with no socket still count as local. Actual: a missing `remoteAddress` is not loopback, so `tts.test.ts` got 403. Workaround: that test now sets `127.0.0.1`.

## Left undone

- Authorization codes still live only in memory. A restart during the five-minute consent window drops the code. Refresh records and the simulator link survive.
- Access tokens are still HMAC. Reuse bumps a stored generation, and new tokens carry `gen`. A token issued before this change, with no `gen`, no longer verifies.
- The SSRF pin is not wired through the society model fetch or the Jina reader.
- The remaining six production-audit findings were not patched.
