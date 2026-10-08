# AGORA+ — Amazon Developer Hackathon pivot plan

## Context
- **Problem:** people are leaving Alexa for ChatGPT and Claude. Alexa+ reviews describe it as slow (up to 15 s), erratic, prone to half-finished tasks and wrong answers, forgetful, chatty, cloud-only and full of ads.
- **What we have:** AGORA already runs a multi-agent "society": the lead plans, workers run in parallel, agents debate, the result is merged into one document, and a human approves.
- **The idea:** copy AGORA (no rebuild) and reshape it into **AGORA+**, an agentic household brain a step ahead of Alexa. Specialist agents plan, show their work, ask before acting, check the result and remember. A self-hosted MCP server makes **the same brain reachable from Alexa+, Claude and ChatGPT** ("one brain, every surface").
- **Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon. Deadline **Fri Oct 23 2026, 12:00 PT** (today is Oct 8).
- **Entries:** **Alexa+** primary track: an MCP server (spec 2025-11-25, Streamable HTTP), an Agent Skill and a simulated Alexa+ voice web app. Mini challenges: **AWS Builder** (Bedrock and Polly) and **Open Source** (new public MIT repo).
- **Judging:** tech implementation, design, impact and quality of idea. A friction log can add up to 10%. The video must be under 3 minutes. AGORA existed before Aug 31, so the README must say what changed during the submission window.
- **Your decisions:**
  - Copy to the sibling folder `/home/ritesh/Documents/agora-plus-alexa-hackathon`, keeping git history, on branch `alexa-hackathon`.
  - Bedrock is enabled on your account.
  - Build with `cursor-agent --model grok-4.7-xhigh`, **one phase at a time, with Claude reviewing between phases**.
  - Hero demo: **family household brain**.

## Research → features (Phase 0b deepens this with a Firecrawl scrape)
| Alexa+ complaint (source) | What AGORA+ does about it |
|---|---|
| Slow, up to 15 s ([Spyglass](https://spyglass.org/broken-alexa-plus.md)) | Spoken acknowledgement in under 1 s before any model call; on-screen meter for time to first speech |
| Erratic, half-finished tasks, routines fail ([Uprisera](https://uprisera.com/blog/en/alexa-plus-failing-amazon-ai-assistant-struggles-2026)) | Plan → approve → run → verify, with a **receipt** for every action (`verified` = read back from disk) |
| Confident wrong answers ([Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/)) | `web_research` with citations, and the existing agent debate checks results |
| Forgot uploaded recipes (Consumer Reports) | **Household memory** you can read, edit and delete, exposed as the MCP resource `agora://memory` |
| Too chatty | Voice reply limited to 2 sentences; detail goes on screen |
| Cloud-only, privacy, ads ([Implicator](https://www.implicator.ai/alexa-at-seven-months-has-amazons-smarter-assistant-proved-itself.md)) | Self-hosted, data on your own disk, approval before side effects, no ads |
| Third-party integrations lag | Standard MCP, so one brain works from Alexa+, Claude and ChatGPT |
| What users want: memory, a checkpoint before acting (Stack Overflow 2026: 63% rarely or never let an agent run on autopilot), control | Editable memory, `daily_briefing` and suggestions, approvals |

> Phase 0b correction: the "62% want proactive assistants" figure could not be verified — do not cite it. Device control (lights, Hue, routines) is the loudest complaint and is not in scope; the demo must not pretend to fix it. See `docs/research/feature-matrix.md`.

## Verified technical decisions
- **MCP:** the v2 SDK `@modelcontextprotocol/server` plus `@modelcontextprotocol/node`.
  - `createMcpHandler(factory, { legacy: 'stateless' })` is wrapped with `toNodeHandler`. It mounts as plain `(req, res)` in both `relayPlugin()` ([server/relay.ts:216](server/relay.ts:216)) and [server/prod.ts](server/prod.ts).
  - It serves spec 2025-11-25 or later.
  - The handler validates no Origin and no token, so we add our own checks in front.
  - Stateless mode means no elicitation. Approvals are two steps instead: a tool returns `needs_approval` plus an `approvalId`, then the client calls `approve_action`.
  - Long runs return immediately; the caller polls `get_run_status`.
- **Alexa+ authentication** ([docs](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html)):
  - OAuth with a client-credentials token (`mcp:service`, Basic auth, validates `resource`, `expires_in` ≤ 3600).
  - Authorization code + PKCE for user scopes (`mcp:tools`, `mcp:resources`).
  - `/.well-known/oauth-authorization-server` lists `client_credentials`, `authorization_code` and `refresh_token`.
  - A 401 response has **no** `WWW-Authenticate` header. Dynamic client registration and OpenID Connect are not used.
  - Development only: a static `AGORA_MCP_TOKEN` for the Inspector and Claude Code.
- **Bedrock:** the "Claude in Amazon Bedrock" Messages endpoint, called with `AnthropicBedrockMantle` from `@anthropic-ai/bedrock-sdk`. **Not Converse**, which only covers Opus 4.6 and older.
  - Model defaults use models open to every account: `BEDROCK_MODEL=anthropic.claude-sonnet-5` and `BEDROCK_FAST_MODEL=anthropic.claude-haiku-4-5`. Opus 5.5 is optional and needs console access.
  - IAM permission: `bedrock-mantle:CreateInference`.
  - Structured outputs aren't available, and `tool_choice` stays on `auto`.
  - The tool loop only appends to history: `response.content` goes back unchanged, and the system prompt and tool list stay fixed per conversation.
- **Voice:** Amazon Polly neural (`@aws-sdk/client-polly`) via `/api/tts`, falling back to browser `speechSynthesis`. Input uses Web Speech `SpeechRecognition`, push to talk, with a text fallback.
- **Reuse instead of rewrite:**
  - `runSociety` in [server/society/Orchestrator.ts](server/society/Orchestrator.ts)
  - `server/research/*` (Exa and Jina) and the SSRF guard [server/proxyGuard.ts](server/proxyGuard.ts)
  - `ServerProvider`/`LLMLike` in [server/society/provider.ts](server/society/provider.ts) and `createRoutingProvider` in [server/routingProvider.ts](server/routingProvider.ts)
  - `RoomState.beginRun` (one run at a time) and the BossCard approval UI pattern
  - The 3D office (`src/simulation/**`) is left alone.

## Execution model
1. **Manual setup, by Claude:**
   - `cp -a` to the sibling folder, then `git checkout -b alexa-hackathon`.
   - Commit the in-progress multi-connection work, tag `pre-window` at `4f61371` (Aug 20), and run `npm ci`.
   - Write `docs/plan/preamble.md` and `docs/plan/phase-N.md`, with prompt text taken from the phases below.
2. **Each phase:** Claude runs this command in the background, with logs going to `~/agora-logs`, outside the repo:
   ```bash
   cursor-agent -p --model grok-4.7-xhigh --force --trust --approve-mcps --workspace /home/ritesh/Documents/agora-plus-alexa-hackathon "$(cat docs/plan/preamble.md docs/plan/phase-N.md)"
   ```
3. **Review gate after each phase, by Claude:** read the diff, then `npm run lint && npm run lint:server && npm test && npm run build`, then a check in the browser. Re-prompt or fix before the next phase. Commit with a phase label.
4. **Preamble rules for every phase:**
   - Read `docs/plan/ROADMAP.md` and `docs/research/feature-matrix.md`.
   - Reuse existing modules and don't touch `src/simulation/**`.
   - Never create `memory/` or `scripts/` directories, because `.gitignore` ignores them.
   - Never commit secrets or `.env*` files.
   - Never import `@modelcontextprotocol/sdk` (that's v1).
   - When unsure of an API, read the `.d.ts` files in `node_modules`.
   - Add vitest tests.
   - Append to `docs/FRICTION_LOG.md` and `docs/HACKATHON_CHANGES.md`.
   - Commit when the gate passes.
5. **What you need to do, because it involves your credentials:**
   - Run `aws configure sso` (or set credentials). The AWS CLI on this machine has none right now.
   - Run the Bedrock smoke test with `curl --aws-sigv4`.
   - Put `FIRECRAWL_API_KEY` in the copy's `.env` if you want runtime web research. I won't copy it from `~/.cursor/mcp.json`.

## Phases
**0a. Baseline (Oct 8)**
- Fix the 5 type errors already in the code:
  - [server/relay.ts:228](server/relay.ts:228): `as Server`
  - [server/relay.ts:431](server/relay.ts:431): narrow `ended`
  - Orchestrator's local `LLMLike` gets optional `usage`
- Add `.agora-data/` to `.gitignore`.
- Add the new environment variable names to `.env.example`.
- Create `docs/plan/ROADMAP.md`, `docs/FRICTION_LOG.md` and `docs/HACKATHON_CHANGES.md`.
- **Accept when:** the full gate passes; it currently fails.

**0b. Customer research with Firecrawl (Oct 8, in parallel)**
- cursor-agent uses its Firecrawl MCP to scrape:
  - Reddit r/alexa and r/amazonecho
  - App Store and Play Store reviews
  - Consumer Reports, The Verge, Wired, Hacker News
  - Surveys on what people want from AI agents
- **Outputs:**
  - `docs/research/alexa-plus-voice-of-customer.md`: themes, how often each comes up, quotes under 25 words each with links.
  - `docs/research/feature-matrix.md`: pain point → feature → MCP tool → demo moment → P0/P1/P2.
  - `docs/research/sources.json`
- **Accept when:** there are at least 25 cited URLs and at least 8 ranked pain points.

**1. Household core and run engine (Oct 9)**
- New files in `server/household/`:
  - `store.ts`: atomic JSON files in `AGORA_DATA_DIR`
  - `memoryStore.ts`, `taskStore.ts`
  - `approvals.ts`: 10-minute expiry
  - `speech.ts`: `toSpeech()`, at most 2 sentences / about 220 characters
  - `briefing.ts`: fixed logic, no model call
  - `team.ts`: Agora (lead), Scout (research), Planner (logistics), Keeper (checks plans against memory)
  - `actions.ts`: the single action layer. Every write returns a receipt `{action, id, verified, at}`.
- `server/hub.ts` and `server/runEngine.ts`: move the `run-society` body out of the relay mostly unchanged.
  - A run started by the server still animates the office through the host socket.
  - Finished runs are saved to `.agora-data/runs/`.
- `server/routes.ts` with `handleApiRoutes`, shared by Vite and `prod.ts`. Routes (same-origin only):
  - `GET /api/household`
  - Create, edit and delete memory
  - Complete a task
  - Approve an action
- Orchestrator: export `planSociety()` and add the `presetTasks` option.
- **Accept when:**
  - The full gate passes, with tests for the stores, approvals, speech and the run engine using a fake model.
  - A swarm run started in the office still completes.

**2. MCP server and OAuth (Oct 10–11)**
- `server/mcp/server.ts` registers the tools, resources and prompts.
  - Every result has a `speech` text block plus `structuredContent {speech, status: ok|needs_approval|error, receipt?, approvalId?}` with a zod `outputSchema`.
  - Tools that don't need a model must not call one: the Alexa+ quickstart wants round trips under 500 ms.
- **Tools:**
  - `ask_agora`
  - `remember`, `recall`
  - `forget` (needs approval)
  - `add_task`, `list_tasks`, `complete_task`
  - `daily_briefing`
  - `plan_and_run` (returns a plan preview plus `approvalId`)
  - `get_run_status`
  - `approve_action`
  - `web_research`
- **Resources:** `agora://memory`, `agora://tasks`, `agora://runs/{id}/document`.
- **Prompts:** `morning-briefing`, `plan-a-week-of-meals`.
- `server/mcp/oauth.ts`:
  - The metadata documents.
  - `/oauth/token`: client credentials with Basic auth and `resource` validation; authorization code + PKCE; refresh tokens. Tokens are HMAC-signed, expire in at most 3600 s, and carry scopes.
  - `/oauth/authorize`: a one-household consent page protected by a passcode.
- `server/mcp/http.ts`:
  - Origin allowlist (403 otherwise).
  - 401 with an empty body and no `WWW-Authenticate` header.
  - `tools/call` requires `mcp:tools`, or the development token.
- `server/mcp/mcp.test.ts`: uses `@modelcontextprotocol/client` with `StreamableHTTPClientTransport` against an ephemeral server, covering:
  - 401 without a token
  - initialize at 2025-11-25
  - tools listed
  - remember → recall round trip
  - forget → `needs_approval` → `approve_action`
- `ask_agora`, `plan_and_run` and `web_research` are stubs until Phase 3.
- **Accept when:** the gate passes, the curl checks (401, metadata, token, initialize) behave as expected, and the MCP Inspector can list and call tools.

**3. Bedrock, tool loop and model-backed tools (Oct 12–13)**
- `server/llm/bedrockProvider.ts` implements `ServerProvider` over Mantle.
  - Model names that don't start with `anthropic.` are mapped to `BEDROCK_MODEL`. This covers the hard-coded `deepseek-v4.1-flash` in `leadNotes`.
  - A refusal becomes a friendly error.
- `server/llm/toolLoop.ts`:
  - Append-only history, at most 4 steps.
  - Results from parallel tool calls go back in one user message.
  - Memory goes in the user turn, never in the system prompt.
- `server/llm/serverProvider.ts`: `AGORA_SERVER_LLM=bedrock`. `routingProvider` falls back to Bedrock when the browser sent no key.
- `server/research/firecrawl.ts`: `POST api.firecrawl.dev/v2/search` when `FIRECRAWL_API_KEY` is set; otherwise the existing Exa research.
- Real implementations:
  - `askAgora`: tool loop with a 9 s timeout.
  - `planAndRun`: memory-augmented brief → `planSociety` → approval → `startSocietyRun` with the household team → `spokenSummary`.
  - Keeper flags conflicts with memory, e.g. "Mia is allergic to peanuts".
- **Accept when:**
  - The gate passes, with fake-provider tests for the loop's ordering, parallel results and step limit.
  - In the Inspector, approving a `plan_and_run` starts a run that shows up live in the office.

**4. Alexa+ simulator and Household panel (Oct 14–16)**
- **Server:**
  - `server/alexaSim/ack.ts`: fixed-logic instant acknowledgement.
  - `server/alexaSim/tts.ts`: `POST /api/tts` → Polly mp3.
    - Responses are cached, and the acknowledgement phrases are generated in advance.
    - Returns 503 when there are no AWS credentials.
  - `server/alexaSim/bridge.ts`: `POST /api/alexa-sim/turn` streams server-sent events.
    - `ack` goes out first.
    - Bedrock then acts as the "Alexa+ reasoning" layer and connects as an **MCP client over real HTTP** to our own `/mcp` with OAuth tokens, never calling `actions.ts` directly. It can be linked through the authorization-code flow ("Link AGORA+" button, like Alexa account linking).
    - Event types: `tool_call`, `tool_result`, `approval_required`, `final` (with timings).
- **Client:**
  - `/alexa` route lazy-loaded from `src/main.tsx` without three.js.
  - `src/alexa/AlexaSimulator.tsx`
  - `StatusRing.tsx`: idle, listening, thinking, speaking, amber for approval, error.
  - `useSpeechInput.ts`, `useSpeechOutput.ts`
  - `ReceiptCard.tsx`
  - `LatencyMeter.tsx`
  - Labelled "unofficial simulated Alexa+". Approvals work by voice ("yes") or by button.
- `src/interface/HouseholdPanel.tsx`: memory you can edit, tasks, approval cards, runs.
- [src/interface/Header.tsx](src/interface/Header.tsx): "Household" and "Alexa+ Simulator" buttons.
- **Accept when:**
  - The gate passes and the e2e test still passes.
  - In Chrome at `/alexa`:
    - "Remember Mia is allergic to peanuts" → acknowledgement in under 1 s and a verified receipt.
    - "Plan dinners this week and add groceries" → amber approval → "yes" → the run appears in the office.
    - "What's my briefing?" works.

**5. Agent Skill, Alexa+ add-on and deploy (Oct 17–18)**
- `skills/agora-household/SKILL.md`, following the [agentskills.io](https://agentskills.io/specification) spec:
  - `name` matches the directory; description of at most 1024 characters.
  - Covers how to connect (`claude mcp add --transport http ...`), the tools, the approval protocol and voice style rules.
- `skills/agora-household/references/ALEXA_ADDON.md`: the `alexa-ai` CLI steps (`new mcp`, `deploy`), `addon.json` limits and auth fields.
- `server/skill.test.ts`: validates the skill's frontmatter.
- `docs/DEPLOY.md`:
  - A named Cloudflare tunnel for the HTTPS URL.
  - AWS hosting: ECS Express Mode with one task and a task role for Bedrock and Polly. Check that it's available first.
  - Cloud Run fallback.
- You try `alexa-ai deploy`. Real Alexa+ is US-only, so any result goes in the friction log.
- **Stretch:** MCP Apps `ui://` household plan card for Echo Show (`@modelcontextprotocol/ext-apps`).

**6. Submission package (Oct 19–22; Oct 23 is buffer)**
- `README.md`:
  - Pitch.
  - A "What changed Aug 31–Oct 23" section from `git diff --stat pre-window..HEAD`.
  - Quickstart.
  - MCP connection guide.
- `docs/ARCHITECTURE.md`: Mermaid diagram of Alexa+ / Claude / simulator → OAuth → `/mcp` → actions → agents on Bedrock → disk, plus Polly.
- `docs/AWS.md`: Bedrock, Polly and deploy, with the IAM policy.
- `docs/FEEDBACK.md`: product feedback, plus feature requests.
- `docs/FRICTION_LOG.md`: worth up to a 10% bonus. Note that the quickstart and the auth page disagree on OAuth, the lifecycle docs show protocol 2025-03-26, and Alexa+ is US-only.
- `docs/DEMO_SCRIPT.md`, under 3 minutes:
  - Hook: cited complaints
  - Remember, with latency meter and receipt
  - Plan, approval, the live office, Keeper catching the allergy
  - Briefing
  - The same memory answered from Claude Code
  - Inspector and OAuth
  - Architecture
- New public MIT repo. Before pushing, confirm `git ls-files | grep -iE '\.env|vercel|secret'` returns nothing.
- Final deliverables (video and exported docs) are also copied to `~/Downloads`.

**Cut in this order if behind schedule:**
1. MCP Apps card
2. Wake word
3. Tool loop inside Orchestrator workers
4. Firecrawl at runtime
5. Authorization-code linking (fall back to the development token with full scopes)
6. AWS hosting (fall back to tunnel or Cloud Run)
7. Memory editing in the panel

**Never cut:** `/mcp` with OAuth client credentials, approvals, the simulator's MCP bridge, Bedrock, Polly, the README "changes" section, FEEDBACK and the friction log.

## Verification (end to end)
- After every phase: `npm run lint && npm run lint:server && npm test && npm run build`. `npm run test:e2e` after Phases 4 and 6.
- **MCP:**
  - `curl -si -X POST localhost:3000/mcp` → 401 with no `WWW-Authenticate` header.
  - Token from `/oauth/token` → `initialize` at `protocolVersion: "2025-11-25"`.
  - `npx @modelcontextprotocol/inspector` lists and calls tools.
  - `claude mcp add --transport http agora http://localhost:3000/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"`, then ask Claude Code "what is Mia allergic to?"
- **Bedrock:** the `curl --aws-sigv4` smoke test against `bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages`, then a real `ask_agora` call.
- **Simulator:** run the three voice scripts from Phase 4 in Chrome (built-in browser pane or Obscura for the non-voice checks), and record time to first speech from `LatencyMeter`.
- **Office regression:** start a swarm from the 3D office header and confirm it completes and the document downloads.

## Risks
- Grok may produce v1 MCP code. The integration test catches it; fallback is `@modelcontextprotocol/sdk@1.x` with a fresh `StreamableHTTPServerTransport` per request.
- AWS credentials or model access may be missing. The Phase 0 smoke test catches this early.
- The `relay.ts` extraction could break the office. Move code verbatim, add tests and check by hand.
- Web Speech only works in Chrome, so record the demo in Chrome and keep the text fallback.
- The data directory is ephemeral on hosted platforms, with one instance. Documented.
- Confirm on Devpost that an existing project with a changes section qualifies, and that a new repo containing older code counts for Open Source.
