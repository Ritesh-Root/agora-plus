# Architecture and maintainability report
Summary: Household writes do go through `server/household/actions.ts`, and the twelve MCP tools share one `speech` + `status` envelope. The voice page and a failed plan preview do not keep that contract. A forget on `/alexa` asks for a yes without naming the fact, a preview that throws is planned again after the yes, and a failed approve cannot be repeated. OAuth refresh and the simulator link live only in this process, so a restart logs Alexa+ out even though the access token would still verify. Leave the large files as they are until after the deadline. The fixes below are small.

## Findings
### ARC-1 Voice approval drops the forget summary
- Severity: P1
- Area: `server/alexaSim/bridge.ts` (voice simulator, MCP `forget`)
- Evidence: `server/mcp/server.ts:208` returns `summary: pending.summary` with speech `"I need a yes before I forget that."` The fact itself is `Forget: ${clip(target.text, 80)}` in `server/household/actions.ts:133`. `server/alexaSim/bridge.ts:123` only copies `structured.preview` into the card and the model payload: `const preview = typeof structured.preview === 'string' ? structured.preview : undefined`. `forget` does not set `preview`. `plan_and_run` does, so meal plans still show steps.
- Why it matters: On `/alexa`, the amber card and the model both fall back to the generic sentence. The person is asked "Should I go ahead?" without hearing which memory will be deleted. That is the checkpoint the pitch sells (Design, Quality of idea).
- Fix: In `parseTool`, if `structured.summary` is a string, use it as `summary` and put it on `forModel`. Keep `preview` as the plan fallback.
- Effort: S
- Confidence: high

### ARC-2 A failed approve is marked approved before the work finishes
- Severity: P1
- Area: `server/household/approvals.ts`
- Evidence: `server/household/approvals.ts:77` sets `action.status = 'approved'` and then `await handler(action.payload)`. A throw returns `ok: false` at line 85 with the status already `approved`. A later call hits line 72, `error: 'resolved'`. `server/runEngine.ts:288` returns `{ ok: false, error: 'A run is already in progress.' }` without throwing, so the same thing happens when the office is busy. `server/mcp/server.ts:439` turns that into a spoken failure, but the approval id is already spent.
- Why it matters: "Yes" during a running office swarm, or a forget whose memory disappeared, answers with a failure and then "That approval was already resolved." The person has to ask from scratch. Two overlapping yeses still cannot double-run, because the status flips before the await (Technical implementation, Design).
- Fix: Leave the approval `pending` until the handler returns success. On a throw or a result with `ok: false`, keep it `pending` so the same id can be retried until it expires.
- Effort: S
- Confidence: high

### ARC-3 A failed plan preview is planned again after the yes
- Severity: P1
- Area: `server/household/actions.ts`, `server/society/Orchestrator.ts`
- Evidence: `server/household/actions.ts:413` catches a preview error and the comment says "The run plans again after approval". Line 424 stores `presetTasks` only when `tasks.length > 0`. `server/society/Orchestrator.ts:392` uses those tasks when present; line 395 calls `planSociety` again when they are absent. `docs/ARCHITECTURE.md:84` says "There is no second planning call." `README.md:20` says "A plan still asks Bedrock once for the step list." The success path is tested (`server/household/actions.test.ts:142`, `expect(plans).toBe(1)`). The catch path is not. `docs/DEMO_SCRIPT.md:43` says an empty step list still waits for a yes. It does not say the yes then plans new steps.
- Why it matters: If the preview throws (no model, timeout, throttle), the card is a sentence, not a step list. Saying yes starts a plan the person never saw. That breaks "show the steps, then run those steps" (Quality of idea, Technical implementation).
- Fix: When the preview throws, still show the waiting card, but do not call `planSociety` from `runSociety`. The approve handler should say the step list was not saved and leave the team stopped.
- Effort: S
- Confidence: high

### ARC-4 OAuth refresh and the simulator link die with the process
- Severity: P1
- Area: `server/mcp/oauth.ts`, `server/alexaSim/oauthClient.ts`
- Evidence: `server/mcp/oauth.ts:52` keeps auth codes and refresh records in `Map`s. `server/mcp/oauth.ts:548` loads the refresh by `jti` and returns `invalid_grant` when the map entry is missing, even if the HMAC still verifies. `server/alexaSim/oauthClient.ts:36` holds the linked account in `let account`. Access tokens are stateless HMAC (`server/mcp/oauth.ts:129`, 3600 seconds). The household passcode cookie is also a stateless HMAC (`server/household/session.ts:37`), so that login survives a restart. `.env.example:19` and `docs/DEPLOY.md:222` call `AGORA_DATA_DIR` the directory for "memory, tasks, approvals, and saved runs." Approvals are only the in-memory map in `server/household/approvals.ts:21`. `docs/ARCHITECTURE.md:107` and `docs/DEPLOY.md:3` already say approvals and the room are one process. They do not say a restart forces Alexa+ to link again.
- Why it matters: Cloud Run idle shutdown, a new task, or a second process drops refresh tokens, in-flight auth codes, the `/alexa` link, voice conversations, and waiting approvals. Household files stay. A judge who linked Alexa+ and comes back after a recycle has to link again (Technical implementation). Two processes also lose memory updates: `memoryStore` and `taskStore` queue writes in memory, and `store.ts` has no cross-process lock.
- Fix: Persist the refresh allowlist and the simulator account under `AGORA_DATA_DIR` with the same temp-file rename as memory. Correct the data-dir sentence so it does not mention approvals. Keep the one-task rule for the live room.
- Effort: M
- Confidence: high

### ARC-5 Environment names do not match what the server reads
- Severity: P2
- Area: `.env.example`, `docs/DEPLOY.md`, `server/relay.ts`, `server/hub.ts`, `vite.config.ts`
- Evidence: Read in code, absent from `.env.example` and the deploy table: `DEMO_HOST_SECRET` at `server/hub.ts:25` (mentioned in `README.md:176` only); `SOCIETY_REPLAY` at `server/relay.ts:395`; `BENCH_REPLAY` at `server/relay.ts:448`; `DISABLE_HMR` at `vite.config.ts:32`. `SOCIETY_REPLAY` calls `room.beginRun` and then `break`s at `server/relay.ts:407` without finishing that run. Documented and never read: `.env.example:13` comments `QWEN_BASE_URL` and `QWEN_MODEL` as overrides. `docs/DEPLOY.md:218` already says the server does not read those names. `PORT` is read in `server/prod.ts:14` and called out in `docs/DEPLOY.md:239` as missing from the example. No other `process.env` name in `server/` or `vite.config.ts` was unread or undocumented beyond these.
- Why it matters: Setting the Qwen comments does nothing, so a deploy can look configured and still call the Token Plan defaults. Setting `SOCIETY_REPLAY` leaves the office run in progress, and the next household yes gets "A run is already in progress." (Technical implementation).
- Fix: Add `DEMO_HOST_SECRET`, `SOCIETY_REPLAY`, `BENCH_REPLAY`, and `DISABLE_HMR` to `.env.example` and the deploy table, with a note that the replay variables are off by default. Delete the Qwen comments or actually read them. One line for `PORT` in the example is enough.
- Effort: S
- Confidence: high

### ARC-6 "Due today" uses the server clock
- Severity: P2
- Area: `server/household/briefing.ts`
- Evidence: `server/household/briefing.ts:16` builds the day with `getFullYear`, `getMonth`, and `getDate`. Nothing in `server/household/` reads a timezone. A container whose clock is UTC treats a Pacific evening as the next calendar day, so a task due today is spoken as overdue.
- Why it matters: The morning briefing is a judged fast-path line. A wrong "due today" is obvious to someone in US Pacific time (Design).
- Fix: Format the day with `Intl.DateTimeFormat` in `America/Los_Angeles`, or an optional `AGORA_HOUSEHOLD_TZ`, and document it next to the other server variables.
- Effort: S
- Confidence: high

### ARC-7 A list of finished tasks is spoken as zero open tasks
- Severity: P2
- Area: `server/mcp/server.ts` `list_tasks`
- Evidence: `server/mcp/server.ts:265` counts open tasks, then line 266 uses the first task of any status when none are open. Line 270 speaks `There are ${open} open tasks. First is ${first.title}.` With only finished tasks that is "There are 0 open tasks" plus a done title. Status is still `ok`, which matches the schema.
- Why it matters: "What's on my list?" after everything is done sounds broken (Design).
- Fix: When `open === 0` and `tasks.length > 0`, say how many are done and do not call a finished title the first open task.
- Effort: S
- Confidence: high

### ARC-8 JSON files and the Polly voice are trusted without a schema
- Severity: P2
- Area: `server/household/store.ts`, `server/runEngine.ts`, `server/alexaSim/tts.ts`
- Evidence: `server/household/store.ts:55` returns `JSON.parse(text) as T`. `memoryStore.ts:42` only checks `Array.isArray`. A file that is a JSON object is treated as empty and the next remember writes over it. `server/runEngine.ts:243` turns any read error, including bad JSON, into `null`, so `get_run_status` says the run was not found. `server/alexaSim/tts.ts:44` casts `POLLY_VOICE` with `as VoiceId`. `server/relay.ts:403` parses `SOCIETY_REPLAY` with `JSON.parse` and walks `sched.schedule` with no check. No `any` in `server/household/` or `server/mcp/`. `server/runEngine.ts:327` still has `let negotiationRes: any`.
- Why it matters: A hand-edited or half-migrated `memory.json` can be replaced on the next save. A bad run file looks like it never happened. A wrong Polly voice fails at synthesize time instead of at startup (Technical implementation).
- Fix: Check memory and task entries for `id` and `text` or `title` before using them, and refuse to rewrite the file when the shape is wrong. Validate `POLLY_VOICE` against the SDK enum and fall back to Joanna.
- Effort: S
- Confidence: high

## What is good (keep)
- MCP tools and the household HTTP routes call `server/household/actions.ts` for saves, edits, tasks, and approvals. The voice bridge does not reimplement those writes. `server/alexaSim/bridge.ts:14` says tools go through `/mcp`. `server/alexaSim/fastPath.ts` only maps a phrase to a tool name and arguments.
- `memoryStore.ts:19` and `taskStore.ts:21` run each file's read-modify-write on one in-process queue. `store.ts:39` writes a temp file and `rename`s it. Concurrent `remember` calls in one process do not drop each other's rows. This was read, not load-tested.
- Every tool handler goes through `result` or `fail` in `server/mcp/server.ts:65`. Both set `speech`, `status` (`ok`, `needs_approval`, or `error`), and `structuredContent`. `toolOutput` at line 49 is that object plus optional `receipt` and `approvalId`. `server/mcp/mcp.test.ts:169` expects `speech` and `status` on every tool's `outputSchema`. Names in `skills/agora-household/references/TOOLS.md` match the twelve tools, three resources, and two prompts. I did not find a handler that returns a status outside that enum.
- The happy path stores the preview and runs those tasks. `server/household/actions.test.ts:142` expects a single `planSociety` call.
- `docs/ARCHITECTURE.md:109` already says the Household panel can delete memory over HTTP without the approval queue. `SUBMISSION.md` does not mention that exception. The panel calls `resolveApproval` directly (`server/routes.ts:402`), which is the same function `approve_action` uses.
- `docs/AWS.md:46` already says `ask_agora` falls back to saved memory when the model is missing or the 9 second timeout fires. `server/llm/toolLoop.ts:129` defaults `maxSteps` to 4, matching `docs/ARCHITECTURE.md:82`.
- Do not split `oauth.ts` (709 lines), `server/mcp/server.ts` (638), `AlexaSimulator.tsx` (583), `actions.ts` (544), or `runEngine.ts` (468) before 23 Oct. The long functions are mostly one HTTP or one turn. The payoff is the four P1 fixes, not a new package layout.

## Scrape log (web members only)
Not a web member. No pages fetched.
