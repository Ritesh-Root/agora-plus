# Devpost fields

Copy the text under each heading. Placeholders are in angle brackets. The hackathon entry is the public MIT repo https://github.com/Ritesh-Root/agora-plus. It carries the full history, including the original AGORA work (https://github.com/Ritesh-Root/agora); the tag `pre-window` marks where the submission window starts.

Measured latencies below are the local fast path with no AWS credentials. Model-path and Polly latencies were not measured. Sources for the customer lines are [docs/research/alexa-plus-voice-of-customer.md](research/alexa-plus-voice-of-customer.md) and [docs/research/sources.json](research/sources.json).

## Project name

AGORA+

## Tagline

A household file on a server you run. Every write comes back with a receipt read from disk. A plan does not start until a person says yes.

## Demo video

`<VIDEO_URL>`

No public video URL is recorded in this repository. The take is [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md): Chrome, open on `/alexa`, stop before 2:55.

## Description

AGORA+ is a household brain you run yourself. Household memory is a file on that server. You can tell it "Remember Mia is allergic to peanuts," ask "What's my briefing?", or say "Plan dinners for this week and add the groceries." It answers the simple ones before any model call. Every write returns a receipt whose `verified` flag is a second read of the file. Forgetting a fact or starting a plan returns `needs_approval` and does not run until a person says an exact yes or uses a button. That wait is enforced in the voice loop: the model is not given `approve_action`.

The surfaces that were run are the unofficial `/alexa` simulator and the MCP server used from Claude Code with `AGORA_MCP_TOKEN`. MCP clients such as Alexa+ add-ons, Claude, and ChatGPT can connect. ChatGPT was not run against this server. A live Alexa+ add-on was not deployed. The manifest is still a template (`https://<host>/mcp`). The server negotiates protocol 2025-11-25 and newer, over Streamable HTTP. Alexa's published client sample sends 2025-03-26. The specification index on 8 Oct 2026 names 2026-07-28 as current. An Agent Skill tells an agent which tool to use and that a `needs_approval` result waits for a person. `daily_briefing` and `list_tasks` put an MCP Apps card on the tool result for a host that supports it.

Eleven tools are always registered. `web_research` is a twelfth when a search key is set. A fact can name a person. A task can name an owner, a list such as shopping, and a reminder time. The briefing speaks a saved allergy when one is stored. Recall says both facts when they tie. An order, a booking, a payment, or a phone call is refused.

Behind a plan, four agents can work on Amazon Bedrock through the Claude Messages endpoint: Agora, Scout, Planner, and Keeper. That path runs only when `AGORA_SERVER_LLM=bedrock` and AWS credentials are present. A live Bedrock call was not recorded. Keeper's job is to check the plan against household memory. Amazon Polly speaks only with AWS credentials. A successful Polly synthesize was not recorded. The browser voice speaks when Polly is unavailable. Time to first audio was not measured. The 3D office defaults to that same Household cast while a run is going. The bundled office models are CC BY-NC and are not needed for `/alexa`.

The voice page is an unofficial simulated Alexa+ experience, for the demo and for anyone who does not have an Echo. It is labeled that way in the app.

What it does not do: it does not control lights, locks, or Hue routines, and it has no calendar and no countdown timer.

## How it works

The voice simulator and Claude Code call `POST /mcp`. Other MCP clients can use the same URL. Tools go through one action layer, which writes household files under `.agora-data` and, after a person's yes, starts a swarm in the run engine. The swarm calls Claude on Bedrock when that path is configured. Events go to the office over the existing WebSocket. Polly serves `/api/tts` when credentials are present.

`forget` and `plan_and_run` return `needs_approval` and an `approvalId`. Remembering and adding a task do not wait. On `/alexa`, an exact yes or no, or the Approve and Decline buttons, call `approve_action`. External clients, including an Alexa+ add-on, can still call that tool themselves. A failed yes leaves the approval pending. Approvals expire after ten minutes and do not survive a restart. The server is stateless, so this is a second tool call rather than an elicitation inside the first one. With no passcode, household HTTP routes answer only on loopback, and production binds `127.0.0.1`. A public bind requires `AGORA_HOUSEHOLD_PASSCODE`. Redirect URIs must match `AGORA_OAUTH_REDIRECT_URIS` exactly.

A diagram and the file map are in [docs/ARCHITECTURE.md](ARCHITECTURE.md).

## Tracks

- Alexa+ (primary)
- AWS Builder
- Open Source

## Built with

From [package.json](../package.json) and the server code:

- MCP TypeScript SDK v2: `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/node` 2.1.1, `@modelcontextprotocol/client` 2.3.1, `@modelcontextprotocol/ext-apps` 2.0.3
- Agent Skills (agentskills.io), skill `agora-household`
- Amazon Bedrock, Claude Messages endpoint, `@anthropic-ai/bedrock-sdk` 0.34.3. Models: `anthropic.claude-sonnet-5`, `anthropic.claude-haiku-4-5`
- Amazon Polly, `@aws-sdk/client-polly`, neural voice Joanna
- React 19, Vite 6, TypeScript, zustand, three.js
- Node.js 22 ([Dockerfile](../Dockerfile))
- Firecrawl for the research pass and, when `FIRECRAWL_API_KEY` is set, for `web_research`

## Repo URL

https://github.com/Ritesh-Root/agora-plus

History starts from AGORA. The pre-window tag is `pre-window` at commit `4f61371` (2026-08-20).

## What changed in the window (Aug 31 – Oct 23, 2026)

AGORA already existed. The tag `pre-window` is commit `4f61371` on 2026-08-20.

`git diff --stat pre-window..HEAD` on 8 Oct 2026, at commit `fa7a9c0`:

```
288 files changed, 29768 insertions(+), 2318 deletions(-)
```

That range is 40 commits, dated 2026-09-23 through 2026-10-08. September continued the office: WebGL2, a swarm that finishes a document, and replay. From 8 Oct the branch adds the household brain: files on disk, receipts, approvals, the MCP server and OAuth, Claude on Bedrock, the voice simulator and its fast path, the Household panel, the Agent Skill, the Alexa+ add-on package, deploy notes, the MCP Apps household card, and the same-day fix wave (people on facts, the shopping list, reminders, the voice approval gate, the household lock, persisted refresh tokens, and the Household office cast).

The phase-by-phase log is [docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md).

Time to first audio was not measured: the browsers on the build machine had no speech voices, so the fast path only ever showed "text only", and Polly and the model path need AWS credentials. Older local timings were acknowledgement and screen times, not first audio. Phase 6 logged 55–58 ms to the acknowledgement, about 100 ms for a full remember turn, and about 800 ms from "plan dinners" to the approval card when a preview existed.

## AWS Builder field

AGORA+ can call Amazon Bedrock and Amazon Polly, and it is written to run as one ECS task. Both run only when AWS credentials are present. Neither was recorded live in this workspace.

Bedrock is the Claude Messages endpoint via `AnthropicBedrockMantle` (`@anthropic-ai/bedrock-sdk`), not the Converse API. Default models are `anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5`. The provider is [server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts). Polly neural speech is [server/alexaSim/tts.ts](../server/alexaSim/tts.ts) (`POST /api/tts`, voice Joanna). The task role allows `bedrock-mantle:CreateInference` and `polly:SynthesizeSpeech`. Deploy steps, including ECS Express Mode and a one-task Fargate fallback, are in [docs/DEPLOY.md](DEPLOY.md). Call counts per voice turn and per swarm run, with no invented prices, are in [docs/AWS.md](AWS.md).

A live Bedrock call and a successful Polly synthesize were not recorded. The build shell had no AWS credentials, so those latencies were not measured.

## Open Source field

**Contribution URL:** https://github.com/Ritesh-Root/agora-plus/compare/pre-window...main (everything since the window opened)

**Repo URL:** https://github.com/Ritesh-Root/agora-plus

**GitHub username:** Ritesh-Root

**Description:**

The contribution in the hackathon window is the household MCP work: a self-hosted server (11 tools always, `web_research` when a search key is set, 3 resources, 2 prompts, Streamable HTTP, OAuth), an Agent Skill, and the unofficial `/alexa` voice page, on top of the existing office. The server negotiates protocol 2025-11-25 and newer. Household files live on the server you run. Forgetting a fact or starting a plan waits for a person's yes, and every write returns a receipt read back from disk.

The code license is [LICENSE](../LICENSE) (MIT). Files under `public/models/` are CC BY-NC 4.0 and are not needed to run `/alexa`. See [LICENSE-ASSETS.md](../LICENSE-ASSETS.md).

`git ls-files` matched only `.env.example` for the secret-filename check (`.env`, `vercel`, `secret`, `credential`, `.pem`, `.key`). No secret file is tracked.

## Product feedback

**Link:** https://github.com/Ritesh-Root/agora-plus/blob/main/docs/FEEDBACK.md

**Summary:**

The MCP TypeScript SDK v2, the Agent Skills spec, Bedrock's Messages endpoint, Polly, and Firecrawl are tools we would use again. Alexa+ MCP is the right integration, and the docs need one auth story: client-credentials scope `mcp:service` versus `mcp:tools`, an empty 401 versus the JSON example, and account linking versus the service token. Three protocol dates are in play: this server negotiates 2025-11-25 and newer, Alexa's published client sample sends 2025-03-26, and the specification index on 8 Oct 2026 names 2026-07-28. Stateless Streamable HTTP cannot elicit, so approvals are a second tool call and the serving docs should say so. The Alexa AI CLI was not run; its reference and the account-linking page do not share one config example. Current Claude models on Bedrock are easy to send to the Converse API by mistake, and the Mantle package still depends on that client. Alexa+ add-on distribution is US-only. Firecrawl blocked Reddit, CNET, and Tom's Guide. The full list, with urgency, is in the feedback doc. The row-level log is [docs/FRICTION_LOG.md](FRICTION_LOG.md).
