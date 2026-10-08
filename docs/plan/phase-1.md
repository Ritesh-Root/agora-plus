# Phase 1: Household core and run engine

Goal: give AGORA a persistent household (memory, tasks, approvals) and let the server start a swarm run without a
browser asking for it. Phase 2 will expose all of this over MCP, so every household operation must live in one
action layer that MCP, REST and agents can share.

## A. Household modules (new, `server/household/`)

1. `store.ts`
   - Data dir: `process.env.AGORA_DATA_DIR || '.agora-data'`, resolved from `process.cwd()`. Export `setDataDir(dir)` for tests.
   - `readJson<T>(name: string, fallback: T): Promise<T>` and `writeJson(name: string, data: unknown): Promise<void>`.
   - Writes are atomic (write `<file>.tmp-<random>` then `rename`) and serialized through one promise queue per file.
   - Create the directory on first write. `name` may include one subfolder (`runs/<id>.json`); reject `..` and absolute paths.
2. `memoryStore.ts` — `memory.json`.
   - Entry: `{ id, text, tags: string[], createdAt, updatedAt, source: 'voice' | 'mcp' | 'ui' | 'agent' }`.
   - `addMemory`, `listMemory`, `searchMemory(query)` (case-insensitive keyword overlap score, best first; empty query = newest first),
     `updateMemory(id, patch)`, `removeMemory(id)`, `memoryMarkdown()` (a readable Markdown list grouped by tag).
3. `taskStore.ts` — `tasks.json`.
   - Task: `{ id, title, due?: string, status: 'open' | 'done', createdAt, completedAt?, source }`.
   - `addTask`, `listTasks(status?)`, `completeTask(idOrTitle)` (exact id first, then case-insensitive title match; idempotent:
     completing a done task returns it unchanged).
4. `approvals.ts` — in memory (no disk).
   - Pending action: `{ id, kind: 'forget' | 'start_run', summary, payload, createdAt, expiresAt, status: 'pending' | 'approved' | 'rejected' | 'expired' }`.
   - `registerApprovalHandler(kind, handler)`, `requestApproval(kind, summary, payload)`, `resolveApproval(id, 'approve' | 'reject')`
     (runs the handler on approve and returns its result), `listPendingApprovals()`.
   - Expiry 10 minutes. Take an optional `now()` for tests.
5. `speech.ts` — `toSpeech(text, { maxSentences = 2, maxChars = 220 } = {})`: strip Markdown (headings, emphasis, links → link text,
   lists, code), drop bare URLs, collapse whitespace, keep at most N sentences, cut at a word boundary under maxChars.
6. `team.ts` — `HOUSEHOLD_TEAM` in the same shape `runSociety` takes for `team` (`{ name, description }`), lead first:
   - Agora — household lead; decomposes requests and writes the final plan in plain language.
   - Scout — researches facts, prices and options; cites sources.
   - Planner — schedules, logistics, budgets, shopping lists.
   - Keeper — checks every plan against household memory (allergies, preferences, routines) and flags conflicts explicitly.
7. `briefing.ts` — `buildBriefing({ tasks, memory, pendingApprovals, recentRuns, now })` with no model call.
   Returns `{ speech, items: string[], suggestions: string[] }`: tasks due today or overdue, open task count, pending approvals,
   runs finished in the last 24 hours, and one proactive suggestion when something needs attention.
8. `actions.ts` — the single action layer. Each function returns a plain object; every write includes
   `receipt: { action, id, verified, at }`, where `verified` is true only if the record was read back from disk after writing.
   - `remember(text, tags, source)`, `recall(query)`, `forget(memoryIdOrQuery)` → always `requestApproval('forget', ...)`.
   - `addTask`, `listTasks`, `completeTask`, `dailyBriefing()`.
   - `requestRun(goal, source)` → `requestApproval('start_run', ...)` with a short summary. The handler calls `startSocietyRun`
     (section B) with `HOUSEHOLD_TEAM`, a brief that includes the relevant household memory (`searchMemory(goal)`, top 8),
     and a provider from `getServerProvider()`.
   - `getServerProvider()` / `setServerProviderFactory(fn)`: for now the default factory builds a routing provider from
     `resolveRoutedAccess({})` (server key only — see `server/modelAccess.ts`); Phase 3 will swap in Bedrock.
   - `householdSnapshot()` for the UI: memory, tasks, pending approvals, recent runs (newest 10 from disk), briefing suggestions.

## B. Run engine (move code out of `server/relay.ts`, do not rewrite it)

1. `server/hub.ts` — `getHub()` returns one process-wide object: `room` (the `RoomState`), `sockets`, `broadcastAll`,
   `hostSocket()` (the host player's socket or undefined), and `pendingBoss` (the map that is per-connection today).
   `attachRelay` uses the hub instead of its local `room`/`sockets`/`pendingBoss`. The `decision-reply` case resolves from the hub map.
2. `server/runEngine.ts` — `startSocietyRun({ brief, provider, model?, team, presetTasks?, source: 'room' | 'household', requester? })`
   returns `{ ok: true, runId } | { ok: false, error }`.
   - Move the body of the `run-society` case from just after the provider is resolved through the `.catch` into this function,
     changing as little as possible. Every `send(ws, …)` becomes "send to `requester` if given, otherwise to the host socket if
     any, otherwise drop". `deliver` keeps its current host-only behavior. The boss asker sends `decision-request` the same
     way and, when nobody is connected, resolves `null` immediately (the decider then falls back as it does on timeout).
   - Keep `room.beginRun` in the relay case for room runs; for household runs `startSocietyRun` calls `room.beginRun` itself
     and returns `{ ok: false, error: 'A run is already in progress.' }` when busy. Simplest: always call it inside
     `startSocietyRun` and have the relay case rely on that.
   - When a run finishes (complete, needs_revision or stopped), persist `runs/<runId>.json`
     (`{ id, brief, source, status, startedAt, finishedAt, tasks: [{id,title,role,status}], synthesis, wordCount }`)
     and `runs/<runId>.md` (the synthesis) through `store.ts`. Export `getRunRecord(runId)` (active run from `RoomState`,
     else disk) and `listRecentRuns(n)`.
   - The relay's `run-society` case becomes: host check → replay branch (unchanged) → resolve provider (unchanged) →
     `startSocietyRun({ …, source: 'room', requester: ws })`.
3. `server/society/Orchestrator.ts`
   - Export `planSociety(brief, provider, options)` containing the existing step 1 (manager decomposition) and returning
     `{ tasks, usage }`. `runSociety` calls it.
   - Add `presetTasks?: SocietyTask[]` to `OrchestratorOptions`; when present, `runSociety` skips planning and uses them.

## C. REST routes (new `server/routes.ts`)

`handleApiRoutes(req, res): boolean` — returns true synchronously when the path is one of ours, then handles it async.
Mount it next to `handleCorsProxy`/`handleModelTest` in both `relayPlugin()` (server/relay.ts) and `server/prod.ts`.
- `GET /api/household` → `householdSnapshot()`.
- `POST /api/memory {text, tags?}`, `PATCH /api/memory/:id {text?, tags?}`, `DELETE /api/memory/:id`
  (a person editing in the UI acts directly — no approval).
- `POST /api/tasks {title, due?}`, `POST /api/tasks/:id/complete`.
- `POST /api/approvals/:id {decision: 'approve' | 'reject'}`.
- Same-origin only for writes: if an `Origin` header is present, its host must equal the `Host` header, else 403.
  JSON bodies only, 64 KB limit, 400 on bad JSON. Never echo stack traces.

## D. Tests (vitest, no network, temp data dir)
- `store` atomic round trip and parallel writes to one file keep valid JSON.
- `memoryStore` add/search/update/remove; `taskStore` complete by title and idempotency.
- `approvals` approve runs the handler once; reject does not; expiry with a fake clock.
- `toSpeech` strips Markdown/URLs and truncates.
- `planSociety` returns parsed tasks with a fake LLM; `runSociety` with `presetTasks` makes no planning call.
- `runEngine` with a fake provider and no sockets: the run completes, `runs/<id>.json` and `.md` exist, a second start while busy fails.
- `routes`: a write with a foreign `Origin` gets 403.

## Acceptance
- The full gate passes.
- `npm run dev`, then `curl -s localhost:3000/api/household` returns JSON with `memory`, `tasks`, `pendingApprovals`, `recentRuns`.
  Stop the dev server afterwards.
- Existing relay behavior for a browser-started swarm is unchanged (same messages, same order to the same socket).
