# Phase 6: Submission package

Goal: everything a Devpost judge needs, written from the repository's real state. Every factual claim must point to a
file, a commit, or a source in `docs/research/sources.json`. Do not invent numbers. If a measurement is missing, write
`TODO(measure)` so Claude can fill it in after recording.

Judging criteria (from the hackathon page): Tech implementation (how well it uses the required tech — MCP, Agent Skills),
Design (complete, coherent, intuitive), Potential impact (credible, specific customer need), Quality of the idea.
Submissions must explain what changed during the window because AGORA existed before Aug 31, 2026.

## Files
1. `README.md` — rewrite the top, keep the useful existing setup material lower down:
   - Name and one-line pitch: "AGORA+ — a household brain one step ahead of Alexa: it plans, asks before acting,
     shows a receipt, and remembers — and the same brain works from Alexa+, Claude and ChatGPT over MCP."
   - "Why": 4 bullets from `docs/research/alexa-plus-voice-of-customer.md` with links (reliability, latency up to 15 s,
     forgotten facts, people want a checkpoint — Stack Overflow 63%). Do not cite the unverified 62% figure.
   - "What it does": the voice simulator, the MCP server (12 tools, 3 resources, 2 prompts, spec 2025-11-25,
     Streamable HTTP, OAuth for Alexa+), the Agent Skill, the household team (Agora, Scout, Planner, Keeper) on Amazon
     Bedrock, Polly voice, approvals, receipts, the 3D office showing the team at work.
   - Screenshots placeholders under `docs/images/` (name them; Claude will capture them).
   - Quickstart (clone, `npm ci`, `.env` from `.env.example`, `npm run dev`, open `/` and `/alexa`), including the minimum
     env for a model (`AGORA_SERVER_LLM=bedrock`, AWS credentials) and for MCP (`AGORA_MCP_TOKEN`).
   - Connect from Claude Code / any MCP client; link to the Agent Skill.
   - "What changed during the hackathon (Aug 31 – Oct 23, 2026)": a short summary plus `git diff --stat pre-window..HEAD`
     totals and a link to `docs/HACKATHON_CHANGES.md`.
   - Tracks entered: Alexa+ (primary), AWS Builder, Open Source. Licence: MIT (code), see LICENSE-ASSETS.md for assets.
   - Honest limits: single household per server, in-memory room, US-only Alexa+ distribution, no device control (see the
     research gap), Web Speech needs Chrome.
2. `docs/ARCHITECTURE.md` — a Mermaid diagram: Alexa+ / Claude / ChatGPT / the voice simulator → OAuth → `/mcp` →
   `server/household/actions.ts` → stores on disk and `runEngine` → agent team on Bedrock → office over WebSocket; Polly for
   speech. Then one short section per component with file links. Explain the approval protocol and receipts.
3. `docs/AWS.md` — the AWS Builder write-up: Amazon Bedrock (Claude via the Messages endpoint, `@anthropic-ai/bedrock-sdk`,
   model ids, where it is called: `server/llm/bedrockProvider.ts`, the tool loop, the swarm), Amazon Polly
   (`server/alexaSim/tts.ts`), deployment on ECS (from `docs/DEPLOY.md`), the IAM policy JSON, and cost notes
   (calls per voice turn and per swarm run, from the code — not invented prices).
4. `docs/FEEDBACK.md` — product feedback for each tool used: Alexa+ MCP toolkit docs, Alexa AI CLI (if used), MCP TypeScript
   SDK v2, MCP Inspector, Agent Skills spec, Amazon Bedrock (Claude Messages endpoint), Amazon Polly, Firecrawl. For each:
   what we used it for, what worked, what needs work, onboarding, would we build with it again. Then feature requests with
   urgency (critical / important / nice-to-have). Pull concrete items from `docs/FRICTION_LOG.md` and
   `docs/research/firecrawl-friction.md`, for example: the auth page requires client credentials while the quickstart
   centers account linking; lifecycle examples show protocol 2025-03-26 while the requirement is 2025-11-25; stateless
   Streamable HTTP cannot use elicitation, so approvals need a second tool call; US-only availability; Converse vs Messages
   endpoint confusion for current Claude models on Bedrock.
5. `docs/FRICTION_LOG.md` — tidy into the Devpost format (task, steps, expected vs actual, severity, workaround,
   actionable suggestion) without losing entries; merge `docs/research/firecrawl-friction.md` into it.
6. `docs/DEMO_SCRIPT.md` — a shot list under 2:55 that leads with the best material:
   - 0:00 hook: three cited complaints on screen (slow, half-finished, forgot) — one line each with source.
   - 0:12 "Remember Mia is allergic to peanuts" in the simulator: instant acknowledgement, receipt `verified ✓`, latency meter.
   - 0:35 "Plan dinners for this week and add the groceries": plan preview with steps → amber ring → "yes" → cut to the
     office where Agora, Scout, Planner and Keeper work → spoken summary where Keeper flags the peanut allergy.
   - 1:30 "What's my briefing?" (no model call, fast) and the Household panel with memory you can edit.
   - 1:50 the same brain from Claude Code: "What is Mia allergic to?" through MCP; MCP Inspector showing tools and OAuth.
   - 2:20 architecture diagram, AWS services, Agent Skill.
   - 2:40 close: one brain, every surface; open source.
   Include the exact utterances, what must be on screen, and where measured latencies go (`TODO(measure)`).
7. `docs/SUBMISSION.md` — copy-ready text for every Devpost field: project name, tagline, description (what it does,
   how it works), tracks, built with, repo URL placeholder, what changed in the window, AWS Builder field, Open Source
   field (contribution URL, repo URL, GitHub username placeholder, description), product feedback (link + summary).
8. Repository hygiene check (report only, do not delete anything): run
   `git ls-files | grep -iE '\.env($|\.)|vercel|secret|credential|\.pem$|\.key$'` and confirm only `.env.example`
   matches; confirm `LICENSE` is MIT.

## Acceptance
- The full gate passes; `npm run test:e2e` passes.
- Every link in README and docs points to a file that exists (write a quick check in `server/skill.test.ts` or a new
  `server/docs.test.ts` that scans relative Markdown links in `README.md` and `docs/*.md`).
