# What changed during the hackathon window (Aug 31 – Oct 23, 2026)

Before the window: baseline tag `pre-window` = commit `4f61371` (2026-08-20).

## Commits already in the window

```
4d95503 Let each agent use its own saved model connection.
431dab6 Give the office floor and furniture distinct colors.
8259238 Describe AGORA from the current source and drop hackathon branding.
1f49694 Add a temporary Cloud Run process for the shared demo room.
414a083 Show swarm steps in the activity log and drop unused scaffolding.
6983ddc Keep a swarm document inside the brief and one active run per room.
1478169 Show when the swarm is debating or assembling the document.
8411707 Let a local swarm finish a document with the selected team.
837b26f Keep character movement in step with the walk cycle.
0955d4d Show each Jev decision and let the boss approve, edit, or reject an ask.
b8f4b56 Research a task on the server only when Jev says it needs current information.
2e7a220 Play recorded society runs from the join screen without a relay or an API key.
cf83bd1 Render the office on WebGL2, with a flat canvas when the GPU is missing.
14aedf3 Checkpoint the society harness and Jev decider before the renderer work.
```

## Phase log

### 2026-10-08 — Phase 0a: Baseline

Made the typecheck pass without changing how the app runs. The Vite relay now passes the dev HTTP server through as a Node `http.Server`. Ending a session reads the failure reason only after the result is narrowed to the failure case, the same way joining a full room already does. The orchestrator's local model-result type now includes the reply text and optional token usage, so the call tally type-checks. `.agora-data/` is gitignored, the new server environment names are listed in `.env.example` with empty values, and this changelog plus the friction log now exist.

### 2026-10-08 — Phase 1: Household core and run engine

The server can now remember facts, keep a task list, and hold an action for approval, all in `.agora-data` (or `AGORA_DATA_DIR`). Every saved change comes back with a receipt that says whether a follow-up read saw the same record. Forgetting something, or starting a household swarm, always waits for a yes or no that expires after ten minutes. A person editing memory in the HTTP API does not need that approval.

Spoken text is shortened to about two sentences, with Markdown and bare links removed. A daily briefing is built from due tasks, open tasks, waiting approvals, and runs from the last day, without calling a model. The household team is Agora, Scout, Planner, and Keeper.

A swarm can start from the server, not only from a browser. The office still animates through the host's socket when someone is connected. Finished runs are saved as `runs/<id>.json` and a markdown file. `GET /api/household` returns memory, tasks, pending approvals, and recent runs. The same routes are mounted in the Vite dev server and the production process.

### 2026-10-08 — Phase 2: MCP server and OAuth

The household is now a self-hosted MCP server at `/mcp`, speaking Streamable HTTP and protocol 2025-11-25. Alexa+, Claude, and ChatGPT can call the same twelve tools the household API already uses: remember, recall, forget, tasks, the daily briefing, plan-and-run, run status, approve, ask, and web research. Forgetting a fact or starting a plan does not happen immediately. Those tools return `needs_approval` and an id, and `approve_action` is what actually does it. `ask_agora` answers from saved memory only. `web_research` says it is not configured yet. Neither calls a model. Three resources are readable: `agora://memory`, `agora://tasks`, and `agora://runs/{id}/document`. Two prompts are registered: morning briefing, and planning a week of meals.

OAuth is a one-household server. The discovery documents list client credentials, authorization code, and refresh tokens. Client credentials use HTTP Basic only and the scope `mcp:service`. The passcode page plus PKCE S256 issues `mcp:tools` and `mcp:resources`, and refresh tokens rotate. Access tokens are HMAC-signed and last at most an hour. If the OAuth secrets are unset, those endpoints return 503 and only the dev token `AGORA_MCP_TOKEN` works. A call to `/mcp` with no token is 401, with an empty body and no `WWW-Authenticate` header. The same routes are mounted in the Vite dev server and the production process.

Checked with the dev server, then stopped it. `POST /mcp` with `{}` and no token returned `401` and the first headers were `Date`, `Connection`, `Keep-Alive`, and `Transfer-Encoding` — no `WWW-Authenticate`, and the body was empty. `GET /.well-known/oauth-authorization-server` returned the issuer `http://localhost:3000`, both OAuth endpoints, the three grants, `S256`, `client_secret_basic`, and scopes `mcp:service`, `mcp:tools`, `mcp:resources`. `initialize` with `Bearer dev-token` and protocol `2025-11-25` came back as one server-sent event whose result had `"protocolVersion":"2025-11-25"` and server name `agora-plus`.

### 2026-10-08 — Phase 3: Bedrock, the tool loop, and real tools

AGORA+ can now think with Claude on Amazon Bedrock through the Mantle Messages API, not the older Converse API. Set `AGORA_SERVER_LLM=bedrock`. The default models are `anthropic.claude-sonnet-5` and, for short answers, `anthropic.claude-haiku-4-5`. Office model names such as DeepSeek and Qwen are sent to the default Bedrock model. If the model refuses, the caller hears "The model declined this request."

`ask_agora` runs a short tool loop on the fast model. It can recall memory, list tasks, read the daily briefing, check a run, and look at the web when Firecrawl or Exa is configured. The reply is at most two spoken sentences. If the model is missing or takes longer than 9 seconds, it falls back to a saved fact. `web_research` uses Firecrawl when `FIRECRAWL_API_KEY` is set, otherwise Exa plus a guarded page read of the top two hits, then answers only from that text and names the source. Tracking parameters (`utm_*`) are removed from those source URLs. If neither key is set, it says web research isn't set up. `plan_and_run` asks the household team for a step list, puts that list on the approval ("Plan: 4 steps — …"), and on yes starts those same steps without planning again. When a household run finishes, the saved record includes a two-sentence `spokenSummary`. If Keeper flagged a conflict, such as an allergy, that summary says so, and `get_run_status` speaks it.

With Bedrock turned on, the office swarm and room chat still run when the browser did not send an API key. An agent whose own connection failed is still rejected.

The live Bedrock call was not made. `aws sts get-caller-identity` in this shell returned `NoCredentials` (unable to locate credentials). There is no model id or latency to record.

### 2026-10-08 — Phase 4: Simulated Alexa+ voice and the household panel

The office header has two new buttons. Household opens a panel for memory, tasks, waiting approvals, recent runs, and the briefing suggestions. A person can add, edit, and delete memory, add and complete tasks, and approve or decline from that panel. A finished run has a Download .md link. Voice simulator opens `/alexa` in a new tab.

`/alexa` is its own page, so the 3D office does not load there. The label is "AGORA+ voice · simulated Alexa+ experience (unofficial)". The screen uses the existing ink, paper, and butter colors. A person can type, or hold a button or the space bar to talk in Chromium. The server speaks a short fixed acknowledgement first ("Got it, saving that.", "Here's your day.", and the other stock lines), then calls this server's own MCP endpoint over HTTP. Tool calls show on the page with a status, the spoken line, how long they took, and whether the receipt was verified. A side effect stays on an amber ring until the person says yes or no. Speech tries Amazon Polly and, on a 503, uses the browser voice instead.

If `AGORA_HOUSEHOLD_PASSCODE` is set, the household, memory, task, approval, run document, voice, and speech routes need the `agora_household` cookie. `POST /api/session` checks the passcode and sets that cookie for 12 hours. With the variable unset, those routes stay open for local development.

The live Chrome demo did not finish a remember, briefing, or dinner plan. This shell still has no AWS credentials (`aws sts get-caller-identity` returned `NoCredentials`). Polly answered `503` `tts_unavailable`. A turn still sent the acknowledgement immediately: the first stream bytes were on the wire in 5 ms, and in Chromium the acknowledgement was on screen in 50 ms and 63 ms. The model step then failed with "Failed to resolve AWS credentials from the credential provider chain." A unit test with a fake model and a real temporary MCP server did show `remember`, a verified receipt, and a final answer. There is no Polly or Bedrock latency to quote.

### 2026-10-08 — Phase 4b: Simulator stage, MCP trace, and a fast path

Simple voice commands no longer wait on a model. "Remember…", "what's my briefing", task add/list/done, "plan…", and yes/no while an approval is waiting are matched by fixed rules and then sent through the same MCP `tools/call` as the model path. The final event says whether the turn was `fast` or `model`. Set `ALEXA_SIM_FAST_PATH=0` to force every turn through the model. If the model has no AWS credentials, an open question is spoken as "My thinking model isn't connected on this server yet…" and the trace keeps the technical error.

`/alexa` is a two-column stage from 1024 px up. The left side is a landscape device with a large ring, a 22 px caption, and Approve / Decline on the device when a plan is waiting. The right side is "Under the hood": protocol, auth, the latency meter, the Spyglass 15 s citation, and a newest-first timeline of each `tools/call`. Below 1024 px the trace stacks under the device.

Checked in Chromium at 1440×900 with no AWS credentials. "Remember Mia is allergic to peanuts" came back verified on the fast path. "What's my briefing?" spoke "Nothing urgent at home." "Plan dinners for this week" showed the approval card. "yes" spoke "The household team has started." The meter read 15 ms to first speech. Screenshots are `docs/images/alexa-sim-desktop.png` (1440×900) and `docs/images/alexa-sim-mobile.png` (375×812). Polly still returns 503 without credentials, so the page used on-screen speech. There is no Bedrock latency to quote.

### 2026-10-08 — Phase 5: Agent Skill, Alexa+ add-on, and deploy

An agent can now follow `skills/agora-household/SKILL.md` to use the household MCP server: how to connect, when to call each of the twelve tools, the three resources, the two prompts, and the rule that a `needs_approval` result waits for a human yes before `approve_action`. `references/TOOLS.md` lists the fields. `references/ALEXA_ADDON.md` is the path for shipping the same server as an Alexa+ add-on, including the CLI steps and the auth values. `server/skill.test.ts` checks every skill's frontmatter and the add-on length limits.

`alexa-addon/addon.json` is the store listing in the quickstart's nested shape: name "AGORA+ Household", US only, MCP URL `https://<host>/mcp`, privacy and terms on that same host. `<host>` is a placeholder. The mark is a butter ring on ink, with PNG icons at 72, 64, 88, 126, 180, and 241, plus a 600×900 carousel image. `public/privacy.html` and `public/terms.html` describe the self-hosted household files, who can read them, how to delete them, and the MIT license with no warranty.

`docs/DEPLOY.md` covers a named Cloudflare tunnel, Amazon ECR plus ECS Express Mode (or one Fargate task), the Bedrock and Polly task-role policy, and Cloud Run. The production bundle was started on port 8099 and then stopped. `POST /mcp` with `{}` and no token returned `401`. The headers were `Date`, `Connection`, `Keep-Alive`, and `Transfer-Encoding`, with an empty body and no `WWW-Authenticate`. `GET /alexa` returned the app HTML. Privacy, terms, and the 72 px icon each returned 200. `alexa-ai` was not installed, logged in, deployed, or submitted.

### 2026-10-08 — Phase 5b: Household card for screens

`daily_briefing` and `list_tasks` now point at one screen card, `ui://daily_briefing/household-card.html`. A host that supports MCP Apps (Echo Show, the Alexa app, Claude, ChatGPT) can show it in the conversation. The spoken line is unchanged. With an empty house, `daily_briefing` still says "Nothing urgent at home." The structured result also lists waiting approvals, with an id and a summary, so the card can act on them.

The card shows the briefing lines, each open task with a Done button, and each waiting approval with Approve and Decline. Done calls `complete_task`. Approve and Decline call `approve_action`. Text is at least 18px and the buttons are at least 48px tall. If the host sends a light or dark theme, the card follows it. Otherwise it uses AGORA's ink, paper, and butter colors. There is no external font or script.

The production bundle was started on port 8099 and then stopped. `POST /mcp` with `{}` and no token returned `401` with an empty body and no `WWW-Authenticate` header. `GET /alexa` returned HTML. `resources/read` of the card URI returned HTML (`text/html;profile=mcp-app`) that includes the view script. The MCP Inspector was not opened. In Chromium, a small stand-in host loaded the same HTML: the page used the dark theme, body text was 18px, the Done button was about 54px tall, and Decline called `approve_action`.

### 2026-10-08 — Phase 6: Submission package

The README now opens as AGORA+. Judges can read [docs/ARCHITECTURE.md](ARCHITECTURE.md), [docs/AWS.md](AWS.md), [docs/FEEDBACK.md](FEEDBACK.md), [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md), and the copy-ready Devpost fields in [docs/SUBMISSION.md](SUBMISSION.md). The friction log is in the Devpost column layout, and the eight Firecrawl research notes are rows at the bottom. [server/docs.test.ts](../server/docs.test.ts) checks that relative links in `README.md` and `docs/*.md` point at files in the tree.

`git diff --stat pre-window..HEAD` at commit `42a83b6` (the phase 5b commit, before this write-up): 228 files changed, 22141 insertions, 2294 deletions. The range is 25 commits, all dated 2026-09-23 through 2026-10-08. The tag `pre-window` is `4f61371` on 2026-08-20. These submission files sit on top of that diff until this phase is committed.

`git ls-files` with the secret-filename pattern matched only `.env.example`. [LICENSE](../LICENSE) is the MIT license.

Operator measurements for the demo, local fast path, no AWS: 55–58 ms to the first acknowledgement, about 100 ms for a full remember turn, about 800 ms for "plan dinners" to reach the approval card. Model-path and Polly numbers are still `TODO(measure)`.

`npm run lint`, `npm run lint:server`, `npm test` (41 files, 155 tests), and `npm run build` passed. `npm run test:e2e` passed on Chromium and Firefox. WebKit is omitted on this host because `ldd` cannot find the MiniBrowser libraries; the config still includes WebKit when that check is clean.

### 2026-10-08 — Fix wave: trust, lock-down, household fields, voice, office

Five agents landed on the same day, after the council audit. This entry is what their notes describe, checked against the code.

**Ask before acting.** The voice simulator no longer gives the model `approve_action`. A person approves with a whole-phrase yes or no (`yes`, `yeah`, `yep`, `go ahead`, `do it`, `approve`, and the matching no phrases in `server/alexaSim/approvalWords.ts`) or with a button. "yes but not Tuesday" and "yesterday" are not a decision. A yes with extra words is "I need a plain yes or no." and does not start a run. Approving marks the row `running` first. A throw or a busy room puts it back to `pending`, so a later yes can retry. A failed plan preview says planning is unavailable and does not create an approval. Approving a plan runs only the saved steps. Orders, purchases, bookings, payments, and phone calls are refused with no approval id. `ask_agora` allows about 4 seconds for an Alexa client and 9 seconds when the MCP client name is `agora-plus-voice`. The Bedrock client uses a 90 second timeout and one retry. Preview and spoken-summary stages use 20 seconds and no retries. A 429 is "The model is busy right now. Try again in a moment." The voice SSE `final` event includes `runId` when that turn started a run. Waiting approvals are still in memory.

**Lock-down.** `npm run dev` binds `127.0.0.1`. `npm run dev:lan` binds `0.0.0.0`. Production binds `0.0.0.0` only when `AGORA_HOUSEHOLD_PASSCODE` is set. With no passcode, household `/api/*` routes return 403 off loopback. A development token shorter than 32 characters is ignored, and it is ignored in production or when `AGORA_PUBLIC_URL` is https unless `AGORA_ALLOW_DEV_TOKEN=1`. `AGORA_TOKEN_SECRET` shorter than 32 characters turns OAuth off. `redirect_uri` must match `AGORA_OAUTH_REDIRECT_URIS` exactly. The simulator's own loopback callback is always allowed. `state` is required. The client secret is accepted in HTTP Basic or the form body, never both. Five wrong passcodes lock the address for 15 minutes. Consent pages send `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Refresh records persist in `oauth-refreshes.json`. Reuse revokes every refresh for that subject and bumps a generation counter. The simulator link persists in `oauth-sim-account.json`. OAuth and `/mcp` return 503 when `AGORA_PUBLIC_URL` is unset and the process is not on loopback. `X-Forwarded-Proto` is ignored unless `AGORA_TRUST_PROXY=1`. With a passcode, the CORS proxy, the model test, and `/__relay` need the household cookie. On an open bind with no `DEMO_HOST_SECRET`, the host seat is the household session. Authorization codes are still only in memory. Vite in this tree is 6.4.4 and `ws` is 8.22.0. `QWEN_BASE_URL` and `QWEN_MODEL` were removed from `.env.example` because the server does not read them.

**Household fields.** Facts can store `who`. A leading name such as "Mia is allergic to peanuts" fills it. The same text after trim and case folding updates the existing row. Recall says both facts on a tie, and "I'm not sure, but I have: ..." when the overlap is partial. Tasks can store `who`, `list`, and `dueAt`. The shopping list is `list: "shopping"`. The briefing speaks one memory line, allergies and medicine first, and speaks "Reminder: &lt;title&gt;." for an open task whose `dueAt` is already past. "Due today" uses `AGORA_TIMEZONE` or the server zone. A bad memory or task file is renamed aside instead of being overwritten with empty JSON. `web_research` is registered only when a search key is set, and its structured result includes source links. The spoken research line still has no URL. `ask_agora` still returns memories without `who`. `POST /api/memory` and `POST /api/tasks` still do not accept the new fields. `alexa-addon/addon.json` enables account linking (authorization code, PKCE S256) with `<host>` still in every URL. There is no calendar and no countdown card.

**Voice page and panel.** The meter is time to first audio, and a turn with no audio says "text only". The page cites Spyglass (Sep 2025, up to 15 seconds) and The Verge (Oct 2026, 3–5 seconds for simple commands). Chips include the allergy question and the shopping list. The open page polls `GET /api/household` about every 30 seconds, speaks each due reminder once per page load, and skips a task that was due more than an hour before the page opened. After a yes it speaks `spokenSummary` once when a run that started at or after that moment leaves `running`. Delete on the Household panel asks Yes or No. Tasks group as To-do, then Shopping. The document title is "AGORA+ voice (unofficial Alexa+ simulator)". The dev-token pill is hidden unless `?debug=1`. The Echo Show card shows a person, a list, and `dueAt` when they are present, and a failed tool call replaces "Loading…".

**Office.** The default cast is Household: Agora, Scout, Planner, and Keeper. A stored `single-agent` id becomes that set. A household run writes `runs/<id>.json` with `status: "running"` at the start and again when it ends, including `spokenSummary`. `recentRuns` is newest first. `society-complete` carries `spokenSummary` when there is one. The Society panel shows that line. A second household start says the team is still working on the last plan. A second office Execute still says a run is already in progress. A failed finished save stays on the run as `needs_revision`. A process death mid-run can leave the file at `status: "running"`.

`git diff --stat pre-window..HEAD` at commit `fa7a9c0`: 288 files changed, 29768 insertions, 2318 deletions. The range is 40 commits, dated 2026-09-23 through 2026-10-08. Time to first audio, a live Bedrock call, and a successful Polly synthesize remain `TODO(measure)`.
