# Devpost fields

Copy the text under each heading. Placeholders are in angle brackets. Do not invent a public URL. The repository that exists today is https://github.com/Ritesh-Root/agora ([package.json](../package.json)). The hackathon entry is a new public MIT repo. Its URL is not published from this workspace.

Measured latencies below are the local fast path with no AWS credentials. Model-path and Polly numbers are `TODO(measure)`. Sources for the customer lines are [docs/research/alexa-plus-voice-of-customer.md](research/alexa-plus-voice-of-customer.md) and [docs/research/sources.json](research/sources.json).

## Project name

AGORA+

## Tagline

AGORA+ — a household brain one step ahead of Alexa: it plans, asks before acting, shows a receipt, and remembers — and the same brain works from Alexa+, Claude and ChatGPT over MCP.

## Description

AGORA+ is a household brain you run yourself. You can tell it "Remember Mia is allergic to peanuts," ask "What's my briefing?", or say "Plan dinners for this week and add the groceries." It answers the simple ones before any model call, shows a receipt whose `verified` flag is a read-back from disk, and waits for a yes before it forgets a fact or starts a plan.

The same twelve tools are an MCP server (protocol 2025-11-25, Streamable HTTP) with OAuth for Alexa+. Claude and ChatGPT call that server too. An Agent Skill tells an agent which tool to use and that a `needs_approval` result waits for a person. A screen card can show the briefing on a host that supports MCP Apps.

Behind a plan, four agents work on Amazon Bedrock through the Claude Messages endpoint: Agora, Scout, Planner, and Keeper. Keeper checks the plan against household memory and the spoken summary says so when something conflicts, such as a peanut allergy. Amazon Polly speaks. The browser voice speaks when Polly is unavailable. The 3D office shows the team while the run is going.

The voice page is an unofficial simulated Alexa+ experience, for the demo and for anyone who does not have an Echo. It is labeled that way in the app.

What it does not do: it does not control lights, locks, or Hue routines. That is the loudest gap in the research, and the demo does not pretend to close it.

## How it works

Alexa+, Claude, ChatGPT, and the voice simulator authenticate and call `POST /mcp`. Tools go through one action layer, which writes household files under `.agora-data` and, after approval, starts a swarm in the run engine. The swarm calls Claude on Bedrock. Events go to the office over the existing WebSocket. Polly serves `/api/tts`.

`forget` and `plan_and_run` return `needs_approval` and an `approvalId`. `approve_action` is the call that deletes or starts the team. Approvals expire after ten minutes. The server is stateless, so this is a second tool call rather than an elicitation inside the first one.

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

`<REPO_URL>`

Suggested shape once the public repo exists: `https://github.com/<GITHUB_USERNAME>/agora-plus`

History starts from AGORA. The pre-window tag is `pre-window` at commit `4f61371` (2026-08-20).

## What changed in the window (Aug 31 – Oct 23, 2026)

AGORA already existed. The tag `pre-window` is commit `4f61371` on 2026-08-20.

`git diff --stat pre-window..HEAD` on 8 Oct 2026, at commit `42a83b6` (phase 5b), before this submission write-up:

```
228 files changed, 22141 insertions(+), 2294 deletions(-)
```

That range is 25 commits. Every one of them is dated 2026-09-23 through 2026-10-08. September continued the office: WebGL2, a swarm that finishes a document, Jev's approve/skip/debate, and replay. From 8 Oct the branch adds the household brain: files on disk, receipts, approvals, the MCP server and OAuth, Claude on Bedrock, the voice simulator and its fast path, the Household panel, the Agent Skill, the Alexa+ add-on package, deploy notes, and the MCP Apps household card.

The phase-by-phase log is [docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md). This Devpost text, the README pitch, and the judge docs are the phase 6 addition on top of that diff. They are in the working tree until the phase is committed.

Local fast path, no AWS: 55–58 ms to the first acknowledgement, about 100 ms for a full remember turn, about 800 ms for "plan dinners" to reach the approval card. Model-path and Polly: `TODO(measure)`.

## AWS Builder field

AGORA+ uses Amazon Bedrock and Amazon Polly, and it is written to run as one ECS task.

Bedrock is the Claude Messages endpoint via `AnthropicBedrockMantle` (`@anthropic-ai/bedrock-sdk`), not the Converse API. Default models are `anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5`. The provider is [server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts). Polly neural speech is [server/alexaSim/tts.ts](../server/alexaSim/tts.ts) (`POST /api/tts`, voice Joanna). The task role allows `bedrock-mantle:CreateInference` and `polly:SynthesizeSpeech`. Deploy steps, including ECS Express Mode and a one-task Fargate fallback, are in [docs/DEPLOY.md](DEPLOY.md). Call counts per voice turn and per swarm run, with no invented prices, are in [docs/AWS.md](AWS.md).

A live Bedrock call and a successful Polly synthesize were not recorded. The build shell had no AWS credentials. Those latencies are `TODO(measure)`.

## Open Source field

**Contribution URL:** `<CONTRIBUTION_URL>`

**Repo URL:** `<REPO_URL>`

**GitHub username:** `<GITHUB_USERNAME>`

**Description:**

AGORA+ is an MIT-licensed household brain: an MCP server (12 tools, 3 resources, 2 prompts, protocol 2025-11-25, Streamable HTTP, OAuth), an Agent Skill, a simulated Alexa+ voice page, and the existing 3D office. Household files live on the server you run. Forgetting a fact or starting a plan waits for approval, and every write returns a receipt read back from disk.

The code license is [LICENSE](../LICENSE) (MIT). 3D assets are CC BY-NC 4.0. See [LICENSE-ASSETS.md](../LICENSE-ASSETS.md).

`git ls-files` matched only `.env.example` for the secret-filename check (`.env`, `vercel`, `secret`, `credential`, `.pem`, `.key`). No secret file is tracked.

## Product feedback

**Link:** [docs/FEEDBACK.md](FEEDBACK.md) in the repo (`<REPO_URL>/blob/alexa-hackathon/docs/FEEDBACK.md` once the remote exists).

**Summary:**

The MCP TypeScript SDK v2, the Agent Skills spec, Bedrock's Messages endpoint, Polly, and Firecrawl are tools we would use again. Alexa+ MCP is the right integration, and the docs need one auth story: client-credentials scope `mcp:service` versus `mcp:tools`, an empty 401 versus the JSON example, and account linking versus the service token. Lifecycle samples should show protocol 2025-11-25. Stateless Streamable HTTP cannot elicit, so approvals are a second tool call and the serving docs should say so. The Alexa AI CLI was not run; its reference and the account-linking page do not share one config example. Current Claude models on Bedrock are easy to send to the Converse API by mistake, and the Mantle package still depends on that client. Alexa+ add-on distribution is US-only. Firecrawl blocked Reddit, CNET, and Tom's Guide. The full list, with urgency, is in the feedback doc. The row-level log is [docs/FRICTION_LOG.md](FRICTION_LOG.md).
