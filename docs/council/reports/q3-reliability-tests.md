# Reliability and test reviewer report
Summary: The suite is green (155 tests, three runs) and the fast path for "remember" is actually tested through the voice stream. The three beats a judge will watch after that are not. The morning briefing still says "Nothing urgent at home" after a saved allergy, a Bedrock plan or swarm call can sit for minutes with no app timeout, and the peanut line in `spokenSummary` is never sent to the voice page or the office socket. I would not treat a green `npm test` as a demo rehearsal.

## Findings
### TST-1 Briefing does not mention anything the household just saved
- Severity: P1
- Area: `server/household/briefing.ts`, voice utterance "What's my briefing?"
- Evidence: `server/household/briefing.ts:72-73` — `speechParts.push(open.length > 0 ? \`You have ${plural(open.length, 'open task')}.\` : 'Nothing urgent at home.');` Memory never enters `speechParts`. `docs/DEMO_SCRIPT.md:63-64` says that after remember and the plan, "the line should mention what is actually saved." `server/mcp/mcp.test.ts:232-236` only checks that `speech` is a string.
- Why it matters: On the 1:30 beat the device says "Here's your day." and then "Nothing urgent at home." even though Mia's allergy is on disk. The Household panel still lists the fact, so the screen and the spoken line disagree. Judging: Design, Quality of idea.
- Fix: Add the newest memory fact (and a finished run, if one exists) to `speechParts`, and assert those words in a briefing test that saves "Mia is allergic to peanuts" first.
- Effort: S
- Confidence: high

### TST-2 A Bedrock plan or swarm call can stall the take
- Severity: P1
- Area: `server/llm/bedrockProvider.ts`, `server/household/actions.ts` `requestRun`
- Evidence: `server/llm/bedrockProvider.ts:109` — `new AnthropicBedrockMantle({ awsRegion: region })` sets no timeout. `node_modules/@anthropic-ai/bedrock-sdk/mantle-client.js:77-80` documents `timeout=10 minutes` and `maxRetries=2`. `node_modules/@anthropic-ai/sdk/client.js:912` — `DEFAULT_TIMEOUT = 600000`. `node_modules/@anthropic-ai/bedrock-sdk/internal/utils/backoff.js:20-22` says 429 is retried. `server/household/actions.ts:413-424` swallows a preview failure, omits `presetTasks`, and the comment at `414` says the run plans again after approval. `server/modelError.ts:29-42` has no 429 or throttle branch, so the office text falls through to "The model could not answer just now." No test throws a timeout or a 429.
- Why it matters: "Plan dinners for this week and add the groceries" is a fast-path tool call, but the step list is a Bedrock `planSociety` call with that 10-minute client. The ring stays on thinking and Approve never appears. If the preview fails quickly, the card has no steps; saying yes starts a second plan, and the office shows "Manager decomposing brief into DAG..." (`src/interface/SocietyPanel.tsx:132-136`) until that call ends. `askAgora` has a 9s timer (`server/household/actions.ts:208` and `489`); the plan and the swarm do not. Judging: Technical implementation, Design.
- Fix: Pass a short timeout (about 15–20s) into the Bedrock client for preview and for each swarm call, and add a test where `generateCompletion` rejects with a 429 so the card still returns and the office error is the public string.
- Effort: M
- Confidence: high

### TST-3 The allergy sentence never reaches the screen the demo stands on
- Severity: P1
- Area: `spokenSummary`, office socket, `/alexa`
- Evidence: `server/mcp/server.ts:444-445` — approve says `The household team has started. Ask me for the status any time.` `server/runEngine.ts:406-443` sends `society-complete` with tasks and synthesis, not `spokenSummary`. A search of `src/` finds no `spokenSummary`. `server/household/actions.ts:342-344` puts it only in `get_run_status` speech. `server/alexaSim/fastPath.ts:87-95` has no status command, so "what's the status" leaves the fast path. `server/household/actions.test.ts:144` checks the JSON file with a fake model, not a page.
- Why it matters: After "yes", `/alexa` speaks the "team has started" line and stops. The office log records titles such as "Finished …", not Keeper's sentence. That sentence is on disk, and Keeper's raw `task.output` is inside the Society panel (`src/interface/SocietyPanel.tsx:199-201`), which the script does not open. The 0:35 payoff ("Mia is allergic to peanuts") is easy to miss on camera. Judging: Design, Impact.
- Fix: Add `spokenSummary` to `society-complete` and render that one line on the office. On the voice page, when a household run finishes, speak `get_run_status` for the latest run. Assert the allergy words on that payload, not only in the JSON file.
- Effort: M
- Confidence: high

### TST-4 The plan-then-yes voice path is untested, and leaving the page drops it
- Severity: P1
- Area: `POST /api/alexa-sim/turn`, `server/alexaSim/bridge.ts`
- Evidence: `server/alexaSim/bridge.test.ts` has three cases: model remember (`86`), fast-path remember (`125`), and an open question with no credentials (`147`). None send the plan utterance or `yes`. `approval_required` is written at `server/alexaSim/bridge.ts:209-214` and never asserted. `server/alexaSim/bridge.ts:244-248` sets `detached` on `close` and does not abort the model or the tool. `speakFast` returns at `205` before `noteTool`, so a disconnect before the tool returns never stores `pendingApprovalId`. `src/alexa/AlexaSimulator.tsx:402-403` is a plain link to `/`, which unmounts the page that holds `conversationId`. Approvals live in a process `Map` (`server/household/approvals.ts:21`).
- Why it matters: The script cuts from `/alexa` to `/` around the yes. If that click happens while the plan turn is still open, the card is gone, "yes" on the way back does not carry the approval id (`server/alexaSim/fastPath.ts:106-107` returns null), and the office never starts. A regression in the SSE card would not fail `npm test`. Judging: Technical implementation, Design.
- Fix: One bridge test: plan utterance emits `approval_required`, then `yes` on the same `conversationId` returns a `runId` and a second start is refused. On `res` `close`, abort the in-flight Bedrock and MCP calls.
- Effort: M
- Confidence: high

### TST-5 A leftover run, or a restart, makes "yes" do nothing useful
- Severity: P1
- Area: `server/runEngine.ts`, in-memory approvals and room
- Evidence: `server/runEngine.ts:287-288` — `if (!begun.ok) return { ok: false, error: 'A run is already in progress.' };` `server/runEngine.test.ts:47-52` checks that error at the engine, not through the voice. `server/runEngine.ts:179-198` writes the run file only when the run finishes. `server/household/approvals.ts:21` and `server/alexaSim/conversation.ts:37` are memory maps. A restart clears both. The room run is gone; the allergy file on disk is not.
- Why it matters: A rehearsal that is still planning makes the recorded "yes" speak "A run is already in progress." Restarting the server to clear that also drops the approval, so the next "yes" is an ordinary model turn and the office stays idle. Judging: Technical implementation.
- Fix: Before the take, refuse to start if `room.currentRun()` is `running`, and say so on the voice page in the same test as TST-4. Treat a restart as "ask for the plan again."
- Effort: S
- Confidence: high

### TST-6 An approval is marked approved before the work runs
- Severity: P2
- Area: `server/household/approvals.ts`
- Evidence: `server/household/approvals.ts:77-85` sets `action.status = 'approved'` and then `await handler(...)`. A throw returns `ok: false` while status is already `approved`. The next resolve hits `72` (`resolved`). `server/household/approvals.test.ts:30-42` expires a pending approval with a fake clock and never goes through MCP, HTTP, or the voice. TTL is 10 minutes (`server/household/approvals.ts:18`), so the scripted 3-minute take will not expire one. A throw during the take will.
- Why it matters: If `getServerProvider()` throws on approve (no Bedrock and no API key), the card is spent. Saying yes again says the approval was already resolved, and the team did not start. Judging: Technical implementation.
- Fix: Run the handler first; set `approved` only after it returns. Add one MCP test for `error: 'expired'`.
- Effort: S
- Confidence: high

### TST-7 A bad memory file throws; a failed run save is swallowed
- Severity: P2
- Area: `server/household/store.ts`, `server/runEngine.ts`
- Evidence: `server/household/store.ts:56-58` rethrows anything that is not `ENOENT`, including invalid JSON. `readEntries` in `server/household/memoryStore.ts:40-42` does not catch that. No test writes a broken `memory.json`. `server/runEngine.ts:206-209` logs a save error and continues, so a full disk keeps the in-memory room copy and drops the file the voice would read later. Half-written JSON is covered (`server/household/store.test.ts:28-45`).
- Why it matters: A hand-edited or truncated `memory.json` makes "Remember…" end as "That did not work." (`server/alexaSim/bridge.ts:216-220`). A failed save means the office can look finished and the next status question cannot find the document. Judging: Technical implementation.
- Fix: If `memory.json` does not parse, return an empty list and a spoken error once, and add a test with `{` as the file. Surface a save failure on the run record instead of only `console.error`.
- Effort: S
- Confidence: high

### TST-8 The Household panel's HTTP writes, and three MCP tools, are untested
- Severity: P2
- Area: `server/routes.ts`, MCP `add_task` / `list_tasks` / `complete_task`, prompts
- Evidence: `server/routes.test.ts` has three tests: cross-origin 403 (`58`), empty `GET /api/household` (`69`), and a path that is not ours (`79`). Nothing asserts `POST /api/memory`, `PATCH` or `DELETE /api/memory/:id`, `POST /api/tasks`, task complete, or `POST /api/approvals/:id`. The demo edits memory from the panel (`docs/DEMO_SCRIPT.md:67`). `server/mcp/mcp.test.ts:14-27` lists `add_task`, `list_tasks`, and `complete_task`, and never calls them. `server/mcp/server.ts:595-612` registers `morning-briefing` and `plan-a-week-of-meals`; no test calls `listPrompts`. `agora://memory` and `agora://tasks` are not read in tests. The run document is (`server/mcp/mcp.test.ts:257`).
- Why it matters: The 1:30 panel edit and the 1:50 Inspector shot (12 tools, two prompts, three resources) are on camera. A broken PATCH or a missing prompt would not fail `npm test`. Judging: Technical implementation.
- Fix: One HTTP test that creates, edits, and deletes a memory, and one MCP test that calls the three task tools and lists both prompts.
- Effort: M
- Confidence: high

### TST-9 A few tests wait on the wall clock; e2e never opens `/alexa`
- Severity: P2
- Area: `server/runEngine.test.ts`, `server/household/actions.test.ts`, `e2e/office.spec.ts`
- Evidence: `server/runEngine.test.ts:55-63` and `server/household/actions.test.ts:126-134` poll for up to 5 seconds with `setTimeout`. `server/household/memoryStore.test.ts:21-22` sleeps 5ms so two `createdAt` values differ. `server/household/session.test.ts:120-125` expects a real wait of at least 200ms (`FAIL_DELAY_MS` is 250 at `server/household/session.ts:12`). They passed three times here. `e2e/office.spec.ts:40-47` opens `/?renderer=webgl` only. I did not run e2e.
- Why it matters: A hung fake run fails the suite at 5 seconds; a slow machine could do that during a parallel council run. Nothing in e2e checks the voice card, the briefing line, or the office snapshot. Judging: Technical implementation.
- Fix: Drive the run tests with a completion callback instead of a poll. Leave e2e as the office smoke test; put the voice beats in the bridge test from TST-4.
- Effort: S
- Confidence: medium

## Coverage map
Risk is what a judge sees if this breaks on the recording. "Tested" means an assertion of the behaviour, not a name in a list.

| Behaviour | Tested? | Risk if broken |
|---|---|---|
| MCP `remember` / `recall` / `forget` + approve | `server/mcp/mcp.test.ts:175-208` | Low for the voice remember beat (also `bridge.test.ts:125`) |
| MCP `plan_and_run` returns `needs_approval` | `server/mcp/mcp.test.ts:219-225` | High: does not approve or check step text |
| MCP `approve_action` starts a run | No | High: demo "yes" |
| MCP `daily_briefing` words | No. `mcp.test.ts:232-236` checks `typeof speech === 'string'` | High: TST-1 |
| MCP `get_run_status` empty and finished document | `mcp.test.ts:238-258` | Medium: does not check `spokenSummary` |
| MCP `ask_agora` with no model | `mcp.test.ts:260-267` | Medium: Claude "peanuts" beat. 9s timeout fallback is untested |
| MCP `ask_agora` tool loop | `server/household/actions.test.ts:36-59` | Medium |
| MCP `web_research` with no key | `mcp.test.ts:227-230` and `firecrawl.test.ts:9-17` | Low on this script |
| MCP `add_task`, `list_tasks`, `complete_task` calls | No (names only, `mcp.test.ts:14-27`) | Low on this script. Store logic: `taskStore.test.ts:20` |
| Resources `agora://memory`, `agora://tasks` | No | Medium for the Inspector shot |
| Resource run document + household card | `mcp.test.ts:257-289` | Low |
| Prompts `morning-briefing`, `plan-a-week-of-meals` | No | Medium for the Inspector shot |
| OAuth metadata, Basic auth, wrong secret | `oauth.test.ts:80-116` | Low if the take uses the dev token |
| Grant `client_credentials` and bad `resource` | `oauth.test.ts:118-136` | Low on the dev-token take |
| Grant `authorization_code` PKCE, code reuse, wrong passcode, evil redirect | `oauth.test.ts:138-227` | Medium if Alexa+ linking is shown |
| Grant `refresh_token` rotate and replay | `oauth.test.ts:229-243` | Medium for a long link |
| Expired access token, tampered token | `oauth.test.ts:246-284` | Low |
| OAuth 503 when secrets are unset; dev token still works | `oauth.test.ts:286-316` | Low: this is the expected local setup |
| OAuth `unsupported_grant_type`, PKCE verifier mismatch, refresh `resource` mismatch, authorize with no passcode, body 413, expired code | No | Low on the dev-token take |
| `GET /api/household` | `routes.test.ts:69` | Low |
| `POST /api/memory` success, PATCH, DELETE | No. Cross-origin POST is `routes.test.ts:58` | Medium: panel edit on camera |
| `POST /api/tasks`, complete, `POST /api/approvals/:id` | No | Medium |
| `GET/POST/DELETE /api/session`, locked document | `session.test.ts:84-145` | Low unless a passcode is set |
| `POST /api/tts` Polly throw → 503 | `tts.test.ts:48-57` | Low: page text does not depend on audio. Success, empty text, and over-length are untested. Browser `speechSynthesis` fallback is untested |
| `GET /api/alexa-sim/link`, `link/complete`, `status` | No | Low on the dev-token take |
| `POST /api/alexa-sim/turn` remember + model-offline | `bridge.test.ts:86-162` | High for every other utterance |
| `GET /api/runs/:id/document` | `session.test.ts:135-137` and `141-144` | Low |
| 405, 413, bad id, invalid JSON | No | Low |
| SSE `ack`, `tool_call`, `tool_result`, `final` | `bridge.test.ts:108-122` | Medium |
| SSE `error` | `bridge.test.ts:158-161` | Medium |
| SSE `approval_required` | No. Writer: `bridge.ts:209-214` | High |
| SSE `formatSseEvent` shape | `sse.test.ts:5-7` | Low |
| Fast path remember, briefing phrases, tasks, plan including the demo sentence, yes/no | `fastPath.test.ts:11-124` | Router is covered. The HTTP stream is not |
| Fast path off | `fastPath.test.ts:118-123` | Low |
| Ack phrases for the demo lines | `ack.test.ts:21-28` | Low |
| Tool loop order, thrown tool, `ok: false`, `maxSteps` | `toolLoop.test.ts:18-124` | Low. Voice `maxTokens: 400` is untested |
| Bedrock system merge, role merge, office model names, refusal | `bedrockProvider.test.ts:33-135` | High for timeout and 429: untested (TST-2) |
| Speech trim | `speech.test.ts:5-26` | Low |
| Approval approve once, reject, fake-clock expiry | `approvals.test.ts:9-42` | Medium: not wired to voice or HTTP (TST-6) |
| Second run refused | `runEngine.test.ts:47-52` | High on a rehearsal leftover (TST-5) |
| `spokenSummary` contains the allergy | `actions.test.ts:144` | High: file only (TST-3) |
| Conversation 30 min and 40 messages | `conversation.test.ts:9-38` | Low for a 3-minute take |
| Firecrawl missing key and v2 body | `firecrawl.test.ts:9-54` | Low. HTTP 503 from Firecrawl is uncaught in that file; `research.ts:91-92` turns it into no hits |
| e2e `/alexa` | No. `e2e/office.spec.ts:40` is the office canvas | High for the voice demo |

Untested, highest demo risk first: (1) voice plan → `approval_required` → yes → one run, (2) briefing speech after a saved fact, (3) `spokenSummary` on the office or the voice page, (4) Bedrock timeout or 429 during preview, (5) approve while a run is already `running`, through the voice, (6) Household panel PATCH, (7) Inspector prompts and `agora://memory`.

## What the live demo would show
### 1. Bedrock sits on "Plan dinners…"
The ack "On it. I'll get the team on that." is already on screen. The ring stays thinking. Approve and Decline are not there, because they render only in the approval phase (`src/alexa/AlexaSimulator.tsx:431-432`). That can last until the client hits 10 minutes, with two retries on a 429. If the preview fails fast, the card does appear, with no step list, and the summary is the goal plus "The household team starts only after you approve" (`actions.ts:418-420`). Saying yes then starts a second plan. The office, after you join, shows the spinner "Manager decomposing brief into DAG..." or, if the call then fails, a red "Swarm Error" of "The model could not answer just now."

Guard: Do not start the take while the office is still planning. Give the plan turn 20 seconds. Read the card. If it does not start with `Plan:` and a step count, do not say yes on the Bedrock take. Click Office only after the yes turn has spoken "The household team has started."

### 2. "What's my briefing?" ignores the allergy
Ack: "Here's your day." Spoken line: "Nothing urgent at home." The Household panel still lists the peanut fact. The script's sentence about the briefing mentioning what was saved will not match the device.

Guard: Speak the line that is on the device. Use the panel, not the briefing, to show the saved fact.

### 3. "Yes" does not put the allergy on `/alexa` or on the 3D view
Ack: "Okay, going ahead." Then: "The household team has started. Ask me for the status any time." Cutting to `/` shows the join modal until someone joins (`e2e/office.spec.ts:44-46`). Events before that join are dropped (`server/runEngine.ts:293-297`); the join sends `society-snapshot` (`server/relay.ts:240-254`), which restores tasks and synthesis, not `spokenSummary`. The allergy text is Keeper's task output inside the Society panel, if the model wrote it. If a rehearsal run is still `running`, yes says "A run is already in progress." instead.

Guard: Join the office once before recording, in the same browser, so you are the host. After yes, open Society and wait for Keeper's card. Restart only between takes, then say the remember line again before the plan: a restart drops the approval and the in-flight run, and keeps the memory file.

## What is good (keep)
- Fast-path "Remember Mia is allergic to peanuts" is tested as rules (`fastPath.test.ts:12-14`) and as an SSE turn that checks `verified` without calling the model (`bridge.test.ts:125-144`).
- The demo plan sentence is one `plan_and_run` goal, including the word "and" (`fastPath.test.ts:84-86`). Compounds of two commands stay off the fast path (`fastPath.test.ts:111`).
- Forget does not delete until `approve_action` (`mcp.test.ts:193-208`).
- OAuth covers PKCE, refresh rotation, a bad secret, an expired token, and "secrets unset, dev token still works" (`oauth.test.ts:138-316`).
- Tool results keep call order when one tool is slower (`toolLoop.test.ts:18-54`). `maxSteps` stops the loop (`toolLoop.test.ts:104-123`).
- Bedrock message mapping merges system text and consecutive roles and starts with a user turn (`bedrockProvider.test.ts:33-64`).
- Polly failures become HTTP 503 (`tts.test.ts:48-57`). The voice page already has the words from SSE; audio is separate (`src/alexa/useSpeechOutput.ts:104-114`).
- Household tests use `mkdtemp` plus `setDataDir`, not a shared `.agora-data`. I saw no test call the public network: Firecrawl and research take an injected `fetch`, and the HTTP tests bind `127.0.0.1`.
- Atomic rename keeps `memory.json` valid JSON under parallel writes (`store.test.ts:28-45`).
- Three full `npm test` runs passed. I did not see an order-dependent failure.

## Commands
- `npm test` (1) — exit 0. Vitest 4.1.9. 41 files, 155 tests, all passed. Started 20:42:14. Duration 2.81s (transform 4.57s, setup 0ms, import 12.14s, tests 3.86s, environment 10ms).
- `npm test` (2) — exit 0. 41 files, 155 passed. Started 20:42:42. Duration 1.86s (transform 2.90s, import 7.49s, tests 3.06s, environment 7ms).
- `npm test` (3) — exit 0. 41 files, 155 passed. Started 20:42:44. Duration 1.95s (transform 2.99s, import 7.72s, tests 2.97s, environment 6ms).
- `npm run lint` (`tsc --noEmit`) — exit 0, no diagnostics, about 19s.
- `npm run lint:server` (`tsc --noEmit -p server/tsconfig.json`) — exit 0, no diagnostics, about 5s.

## Not checked
- Live Bedrock and Polly. No AWS credentials on this machine, and this task does not start a server. Latency stays `TODO(measure)`.
- `npm run test:e2e`, `npm run dev`, and `npm run build`. Not run. The voice page was not opened in a browser, so the `speechSynthesis` fallback and the join-modal timing are from code only.
- Whether a real Bedrock 429 body string contains "429". The office copy above is the `publicModelError` fallback when the message does not match the branches in `modelError.ts`.
