# Demo script

Target length: under 2:55. Record in Chrome. Open on `/` for the household Home. The office is `/office`. Stop before 2:55.

Do not put article sentences on screen. Say the complaints in our own words. The dated sources are in [README.md](../README.md) (Spyglass, 30 Sep 2025, up to 15 seconds; The Verge, 8 Oct 2026, three to five seconds for timers and weather; Wired, 6 Mar 2026; Consumer Reports, 19 Dec 2025).

Two setups:

- **Fast path, no AWS.** Remember, the shopping list, the briefing, and recall. Polly returns 503 and the page uses the browser voice, or the meter says "text only" when no audio starts. Read the meter. It is time to first audio. It has not been measured: the build machine's browsers had no speech voices. Do not read the older acknowledgement timings (5 ms on the wire, 50 ms and 63 ms on screen, or the phase 6 band of 55–58 ms) as time to first audio.
- **Bedrock on.** The plan, the yes, and Keeper's spoken line need `AGORA_SERVER_LLM=bedrock` and AWS credentials. Without them, "plan dinners" says "Planning is unavailable right now." and does not show an approval card. Model-path latency and a successful Polly synthesize were not measured.

Say the page is an unofficial simulated Alexa+ experience. Do not show a light, a lock, a Hue routine, a calendar, or a countdown. The office shot is the four names and the summary line. Do not linger on the bundled 3D models. They are CC BY-NC and `/alexa` does not need them.

## 0:00 — Hook (about 12 seconds)

**On screen.** `/`. Three lines in our words, no article text:

- Simple commands are still slow.
- Multi-step jobs stop halfway.
- A fact you already saved can be gone later.

**Say.** "People still wait on simple commands, watch jobs stop halfway, and lose facts they already told the assistant. This one keeps the file on a server you run."

## 0:12 — Who, and the allergy (about 16 seconds)

**Utterance, typed or spoken.** `Remember Mia is allergic to peanuts`

**On screen.**

- The acknowledgement "Got it, saving that." ([server/alexaSim/ack.ts](../server/alexaSim/ack.ts)).
- Under the hood: one `tools/call` for `remember`, route `fast`.
- The receipt with `verified` checked. The action is `remember`.
- The meter: milliseconds to first audio, or "text only".

**Say.** "Mia is the person on that fact. The receipt is a read-back from disk, before any model call."

## 0:28 — Shopping list (about 12 seconds)

**Utterance.** `Add milk to my shopping list`

**On screen.** The acknowledgement "On it." The trace is `add_task` with `list` `shopping`. Open Household if you have a second to show the Shopping group. A reminder such as "remind me to call Grandma at 6pm" is the same task store with `dueAt`. Skip that utterance if the clock is tight. The page speaks "Reminder: &lt;title&gt;." once when that time is already past.

**Say.** "The shopping list is its own list. The main to-do list stays separate."

## 0:40 — Briefing (about 16 seconds)

**Utterance.** `What's my briefing?`

**On screen.**

- Acknowledgement: "Here's your day."
- The spoken line includes "Remember: Mia is allergic to peanuts." That sentence is fixed logic ([server/household/briefing.ts](../server/household/briefing.ts)). With an empty house and no memory it is "Nothing urgent at home."

**Say.** "The morning line comes from the file. It says the allergy back."

## 0:56 — Plan, then an exact yes (about 28 seconds)

Record this beat with Bedrock so the steps are real.

**Utterance.** `Plan dinners for this week and add the groceries`

**On screen, before the yes.**

- Acknowledgement: "On it. I'll get the team on that."
- A plan preview. The card text starts with `Plan:` and a step count ([server/household/actions.ts](../server/household/actions.ts)).
- The ring is amber. Approve and Decline are on the device.
- Do not say "yes but not Tuesday." That is not a yes. The page answers "I need a plain yes or no."

**Utterance.** `yes`

**On screen.** "Okay, going ahead." The team starts. If the room is busy, the approval stays pending and a later yes can retry.

**Say.** "It shows the steps and waits. The model cannot approve this. I did."

## 1:24 — The team (about 22 seconds)

**On screen.** `/`, the Plans card. While the run is going it lists Agora, Scout, Planner, and Keeper and each step with its status ([src/home/PlansCard.tsx](../src/home/PlansCard.tsx), [server/household/team.ts](../server/household/team.ts)). When the run leaves `running`, the card shows the spoken summary with an allergy or a conflict in red, the team that made it, and "Read plan". That same `spokenSummary` is spoken once. The 3D view of the same run is optional at `/office` (footer link "Team view (3D)").

**Say.** "Agora, Scout, Planner, and Keeper. The line on screen is the one the house hears."

On Qwen 2.5 32B through Featherless, a six-step picnic plan finished in about 24 seconds, and the four-step dinner plan in the video took 136 seconds. Bedrock was not measured. If the document is still writing, cut on that line.

## 1:46 — Claude Code (about 24 seconds)

The server is already running. Connect with the development token, at least 32 characters, as in [skills/agora-household/SKILL.md](../skills/agora-household/SKILL.md):

```bash
claude mcp add --transport http agora http://127.0.0.1:3000/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"
```

**Utterance in Claude Code.** `What is Mia allergic to?`

**On screen.** The reply names peanuts. The tool trace is `recall` or `ask_agora` against this server. `recall` says both facts when they tie. `ask_agora` with no model names the top saved fact. Round-trip time for the `recall` call itself, measured with curl on loopback on 12 Oct 2026: median 3.8 ms over 11 calls (2.8–8.4 ms). Claude's own thinking time comes on top.

**Say.** "Same file. Claude Code is another client. ChatGPT and a live Alexa+ add-on were not part of this take. They can connect to the same server."

Skip the Inspector if the clock is past 2:10. If you have the seconds: the tool list is 11 tools, or 12 when a search key is set. `initialize` may arrive as an SSE `event: message` frame. That is success. The Inspector was not opened during the build ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)).

## 2:10 — How it is built (about 16 seconds)

**On screen.** The diagram in [docs/ARCHITECTURE.md](ARCHITECTURE.md). One line: we negotiate 2025-11-25 and newer; Alexa's client sample sends 2025-03-26; the spec index on 8 Oct 2026 names 2026-07-28. Bedrock and Polly only with AWS credentials. The skill open at the approval rule.

**Say.** "The file is on this server. The receipt is a second read. The yes is in the code."

## 2:26 — Close (about 14 seconds)

**On screen.** `/alexa`, with the verified receipt still up if it is. One line of type: a file, a receipt, a yes. MIT for the code ([LICENSE](../LICENSE)). `public/models/` is CC BY-NC and is not in this page.

**Say.** "One household file. It asks first, it shows a receipt, and it remembers who. The code is open source."

Stop before 2:55.
