# Demo script

Target length: under 2:55. Record in Chrome. The voice page is `/alexa`. The office is `/`.

Two setups:

- **Fast path, no AWS.** Remember, the briefing, and the approval card. Polly returns 503 and the page uses on-screen speech. These timings are from the local fast path with no AWS credentials: 55–58 ms to the first acknowledgement, about 100 ms for a full "remember" turn, about 800 ms from "plan dinners" to the approval card. An earlier Chromium pass in [docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md) saw the acknowledgement on screen at 50 ms and 63 ms, and one meter reading of 15 ms. Read the meter in the take. If it differs, keep the meter's number.
- **Bedrock on.** The office swarm and Keeper's spoken allergy line need `AGORA_SERVER_LLM=bedrock` and AWS credentials. Model-path latency and a successful Polly synthesize are `TODO(measure)`. A unit test with a fake model checks that the saved `spokenSummary` mentions the peanut allergy ([server/household/actions.test.ts](../server/household/actions.test.ts)). That test is not a recording.

Say the page is an unofficial simulated Alexa+ experience. Do not show a light, a lock, or a Hue routine. Device control is the research gap in [docs/research/feature-matrix.md](research/feature-matrix.md).

## 0:00 — Hook (about 12 seconds)

**On screen.** Three lines, one source each. Full citations are in [docs/research/alexa-plus-voice-of-customer.md](research/alexa-plus-voice-of-customer.md) and [docs/research/sources.json](research/sources.json).

- Slow. "some requests taking up to 15 seconds" — [Spyglass](https://spyglass.org/broken-alexa-plus/), 30 Sep 2025.
- Half-finished. "half-completing tasks" — [Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/), 6 Mar 2026.
- Forgot. "two weeks later, it had no idea what I was talking about" — [Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/), 19 Dec 2025.

**Say.** "People are waiting up to 15 seconds, watching jobs stop halfway, and losing facts they already told the assistant."

## 0:12 — Remember (about 23 seconds)

**Utterance, typed or spoken.** `Remember Mia is allergic to peanuts`

**On screen.**

- The ring leaves idle.
- The acknowledgement "Got it, saving that." ([server/alexaSim/ack.ts](../server/alexaSim/ack.ts)). Time to first acknowledgement: the meter. Expected band on the local fast path, no AWS: 55–58 ms. Polly time to first audio: `TODO(measure)`.
- Under the hood: one `tools/call` for `remember`, route `fast`.
- The receipt with `verified` checked. The action is `remember`.
- Full turn on that same local run: about 100 ms. Put the meter's "ms to the answer" on screen.

**Say.** "It answers before any model call, and the receipt is a read-back from disk."

## 0:35 — Plan, approve, office (about 55 seconds)

**Utterance.** `Plan dinners for this week and add the groceries`

**On screen, before the yes.**

- Acknowledgement: "On it. I'll get the team on that."
- A plan preview with steps. If Bedrock planned, the card text starts with `Plan:` and a step count ([server/household/actions.ts](../server/household/actions.ts)). If the preview could not call the model, the card still waits and the step list is empty. Record this beat with Bedrock so the steps are real.
- The ring is amber. Approve and Decline are on the device.
- Time from the utterance to that card, local fast path, no AWS: about 800 ms. With Bedrock planning the steps: `TODO(measure)`.

**Utterance.** `yes`

**On screen, after the yes.**

- Cut to `/`, the 3D office. Agora, Scout, Planner, and Keeper are the household team ([server/household/team.ts](../server/household/team.ts)). The run animates through the office socket ([server/runEngine.ts](../server/runEngine.ts)).
- Back on `/alexa`, or over the office, the spoken summary. Keeper's flag has to be in it: Mia is allergic to peanuts. That sentence is `spokenSummary` when the run finishes.
- Swarm latency, Bedrock: `TODO(measure)`. Polly for the summary: `TODO(measure)`.

**Say.** "It shows the steps and waits. The team does the work in the office. Keeper is the one who catches the allergy."

## 1:30 — Briefing and the household panel (about 20 seconds)

**Utterance.** `What's my briefing?`

**On screen.**

- Acknowledgement: "Here's your day."
- The spoken line from `daily_briefing`. With an empty house the line is "Nothing urgent at home." After the remember and the plan, the line should mention what is actually saved. This tool does not call a model ([server/household/briefing.ts](../server/household/briefing.ts)).
- Latency for this utterance: `TODO(measure)`. It is a fast-path tool call, so it should sit with the remember turn, not with a model turn.

**Then.** Open Household from the office header ([src/interface/Header.tsx](../src/interface/Header.tsx)). The panel lists the peanut fact. Edit the text, or delete it and add it again, so a judge sees the file is not a log they cannot touch ([src/interface/HouseholdPanel.tsx](../src/interface/HouseholdPanel.tsx)).

**Say.** "The morning briefing is fixed logic. The memory is a file you can edit."

## 1:50 — The same brain from Claude, then the Inspector (about 30 seconds)

**Claude Code.** The server is already running. Connect with the development token, as in [skills/agora-household/SKILL.md](../skills/agora-household/SKILL.md):

```bash
claude mcp add --transport http agora http://127.0.0.1:3000/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"
```

**Utterance in Claude Code.** `What is Mia allergic to?`

**On screen.** Claude's reply names peanuts. The tool trace shows `recall` or `ask_agora` against this server, not a guess from the chat. Round-trip time: `TODO(measure)`.

**Then.** MCP Inspector on the same URL.

- The tool list: 12 tools.
- Resources `agora://memory`, `agora://tasks`, and a run document.
- Prompts `morning-briefing` and `plan-a-week-of-meals`.
- OAuth metadata at `/.well-known/oauth-authorization-server`, or the development token if OAuth secrets are unset.

The Inspector was not opened during the build ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)). This shot is the recording, not a result we already have. `initialize` may arrive as an SSE `event: message` frame. That is success.

**Say.** "Same memory. Claude is just another client."

## 2:20 — How it is built (about 20 seconds)

**On screen.** The diagram in [docs/ARCHITECTURE.md](ARCHITECTURE.md). Then the AWS line from [docs/AWS.md](AWS.md): Bedrock Messages (`anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5`) and Polly. Then the skill file [skills/agora-household/SKILL.md](../skills/agora-household/SKILL.md), open at the approval rule.

**Say.** "Alexa+, Claude, and ChatGPT call one MCP server. Bedrock plans. Polly speaks. The skill tells an agent to wait for a yes."

## 2:40 — Close (about 15 seconds)

**On screen.** The office, or the voice page with the verified receipt still up. A line of type: one brain, every surface. MIT for the code ([LICENSE](../LICENSE)). Asset terms in [LICENSE-ASSETS.md](../LICENSE-ASSETS.md).

**Say.** "One household brain. It asks first, it shows a receipt, and it remembers. The code is open source."

Stop before 2:55. If the office swarm is still running, cut on Keeper's allergy line rather than waiting for the document to finish.
