# W6 integration and QA

The five first-wave branches now agree on the household fields, the voice yes/no, and the run the office can restore. The gate below is the one that passed in this worktree.

## What changed

- `server/routes.ts`: `POST /api/memory` passes optional `who`. `POST /api/tasks` passes optional `who`, `list`, and `dueAt`. A non-string is 400.
- `server/routes.test.ts`: creates, edits, completes, and approves a memory and a task from loopback with no passcode. The same writes are 403 from another machine with no passcode, 401 with a passcode and no cookie (loopback and another machine), and 200 from another machine once the cookie is set.
- `server/household/session.ts`: with `AGORA_TRUST_PROXY=1`, the passcode limiter keys on the first `X-Forwarded-For` address. Without that setting the header is ignored.
- `server/household/session.test.ts`: the wrong-passcode wait uses fake timers. A forwarded address does not share a lockout with the proxy, and only when the proxy is trusted.
- `server/household/actions.ts`: a forget summary is the whole fact, not an 80-character clip. `ask_agora`'s memory fallback uses the recall sentence. `list_tasks` inside that loop receives `list`.
- `server/alexaSim/fastPath.ts`: "Forget that …" calls `forget` without a model. "don't forget …" stays a remember.
- `server/alexaSim/tts.ts`: `AGORA_TTS=0` returns 503 and does not call Polly. Any Polly call gives up after 4 seconds so a missing credential cannot hold the caption.
- `server/runEngine.ts`: `whenRunSettled(runId)` resolves when that run's finish path ends. The spoken summary is copied onto the room run.
- `server/roomState.ts`: the room run keeps `spokenSummary`.
- `server/relay.ts`: a join's `society-snapshot` includes `spokenSummary` when the room run has one.
- `server/modelAccess.ts`: a checked model URL is returned as the same URL object the guard pinned.
- `server/routingProvider.ts` and `server/society/provider.ts`: that object is fetched with `fetchPinned`. A default host that was never checked still uses `fetch`.
- `server/proxyGuard.ts`: `fetchPinned` takes `timeoutMs` so a model call is not cut off at 30 seconds.
- `server/research/readUrl.ts`: a public page is read through the Jina URL on the addresses the guard checked.
- `src/alexa/turnTiming.ts` and `src/alexa/AlexaSimulator.tsx`: an approval card stays up through a later turn, including "yes but not Tuesday", until `approve_action` finishes.
- `e2e/alexa.spec.ts` and `playwright.config.ts`: `/alexa` on a private data directory and a 38-character dev token. Polly is off. One worker, so Chromium and Firefox do not write the household at the same time. WebKit still skips when MiniBrowser's libraries are missing.
- `.env.example`: `AGORA_TIMEZONE` and `AGORA_TTS`.

## Finding IDs closed

TST-8, TST-9 for the waits that can be driven without the wall clock. SEC-12 for the society model fetch and the Jina reader. The CORS proxy and the model test were already pinned.

TST-9 left in place, on purpose: the society orchestrator waits 5 ms so workers actually overlap (`maxConcurrency`), and the office e2e waits for two different canvas frames. Fake timers would not move WebGL.

## Contracts

1. Create routes store `who`, `list`, and `dueAt`. `GET /api/household` already returned them.
2. A late office join gets `spokenSummary` on `society-snapshot` when the in-memory run has one. `recentRuns` was already newest first.
3. The voice path still does not let the model call `approve_action`. The bridge test already expects `runId` on `final`.
4. `approvalDecision` is unchanged. The card stays up when the phrase is not a whole yes or no.
5. The simulator poll and "Reminder: <title>." were already in the voice page. This wave did not add a reminder beat to e2e.
6. Run-completion speech was already in the voice page. The e2e forget does not start a run.

## Needs from others

Done here:

- Optional `who` / `list` / `dueAt` on the create routes.
- `AGORA_TIMEZONE` in `.env.example`.
- `ask_agora` fallback uses `speakRecall`. `list_tasks` in that loop gets `list`. `who` is still omitted from `ask_agora` tool output because that schema rejects extra properties.
- Forget summary is the full fact.
- `spokenSummary` on the room run and the join snapshot.
- Pinned fetch for a caller-supplied model URL and for the Jina reader.
- "Forget that …" on the fast path, so the voice page can forget with no model.

Left as they are:

- The MCP instructions may still tell an external client to call `approve_action`. That is for Alexa. It was not copied into the voice prompt.
- `DELETE /api/memory/:id` still deletes with no approval record. The Household panel already asks Yes/No and then calls that route. A second approval on the route would make that Yes fail.
- `QWEN_BASE_URL` and `QWEN_MODEL` stay unread. The example file already says the server uses the Token Plan host unless the caller passes a URL.
- A second office Execute still says "A run is already in progress." A household start, while one is active, still says "The team is still working on the last plan. Ask me for its status." `runEngine.test.ts` requires both sentences.
- `src/simulation/SceneManager.ts` was not edited. Characters still walk in task order.
- README and the other docs were not edited. The docs agent should mention the passcode bind, `AGORA_OAUTH_REDIRECT_URIS`, 32-character secrets, `AGORA_PUBLIC_URL`, `AGORA_TIMEZONE`, `AGORA_TTS=0`, and that `npm run dev` binds `127.0.0.1`.

## Gate

`npm run lint` — exit 0 (`tsc --noEmit`).

`npm run lint:server` — exit 0 (`tsc --noEmit -p server/tsconfig.json`).

`npm test` — 56 files, 251 tests, passed.

`npm run build` — exit 0. Vite wrote `dist/`. One chunk is over 500 kB. That warning was already there.

`npm run test:e2e` — 4 passed (Chromium and Firefox: `/alexa` and the office canvas). WebKit skipped: MiniBrowser's host libraries are missing.

Production bundle, after that build:

```
./node_modules/.bin/esbuild server/prod.ts --bundle --platform=node --format=esm --outfile=<dir-inside-the-project>/server.mjs --packages=external
```

With `AGORA_HOUSEHOLD_PASSCODE` set, port 3300: log and socket `0.0.0.0:3300`. `GET /` 200. `GET /api/household` 401 `{"error":"household_locked"}`.

With the passcode unset: log and socket `127.0.0.1:3300`. `GET /` 200. `GET /api/household` 200 with empty memory, tasks, approvals, and runs. The process was stopped after each check.

## Friction

- Task: show the recall answer in the headless browser. Expected: the caption moves from "Let me check." to the fact. Actual: Polly's client sat on credentials, so the acknowledgement never finished and the answer stayed hidden. Workaround: `AGORA_TTS=0` on the e2e server, a 4 second cap on Polly, and a speech stub that ends the line immediately.
- Task: start the esbuild bundle from `/tmp`. Expected: `node server.mjs` listens. Actual: `--packages=external` resolves `ws` from the bundle's directory, and `/tmp` has no `node_modules`. Workaround: write the bundle under this project, which is also where the Dockerfile writes `dist/server.mjs`.
- Task: `if (!who.ok)` in a route. Expected: the error field is visible to TypeScript. Actual: the root `tsc` program is not strict, so the check does not narrow. Workaround: `who.ok === false`.
- Task: one e2e household for Chromium and Firefox. Expected: one milk on the shopping list. Actual: both browsers share the server's data directory, so the second browser saw two. Workaround: `workers: 1` and assert the first milk. The directory is still shared across the two projects.

## Left undone

- The orchestrator's 5 ms overlap delay, and the office canvas frame waits.
- The passcode overlay still does not take focus, and Escape does not dismiss it.
- Default model hosts that were not passed through the guard still use `fetch`. The Jev client was not switched to `fetchPinned`.
- A household delete from the API still has no approval row.
- A process that dies mid-run can leave `runs/<id>.json` as `running`.
- OAuth authorization codes are still only in memory.
