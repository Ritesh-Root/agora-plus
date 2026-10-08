# Feature matrix

Ranked from the source counts in [alexa-plus-voice-of-customer.md](alexa-plus-voice-of-customer.md). Tool names match `docs/plan/ROADMAP.md`. Evidence counts are distinct URLs in that research pass, not a population survey.

| Rank | Pain point / need | Evidence (n sources) | AGORA+ feature | MCP tool / resource | Demo moment | Priority (P0/P1/P2) |
|---|---|---|---|---|---|---|
| 1 | Routines and multi-step jobs stop halfway | 10 (Spyglass, Wired Mar 2026, Verge Sep 2025, Pogue, six Reddit threads) | Plan, then approve, then run, then a receipt read back from disk | `plan_and_run`, `approve_action`, `get_run_status`, `add_task`, `list_tasks`, `complete_task` | "Plan dinners this week and add groceries" turns the ring amber; "yes" starts the office run; the card shows `verified` | P0 |
| 2 | Replies take many seconds, including for lights | 5 (Spyglass up to 15 s and over 10 s; a Wired reader comment of 7–10 s; three Reddit threads) | Fixed acknowledgement before any model call, plus an on-screen meter | Simulator only (not a model tool): instant acknowledgement, latency meter | "Remember Mia is allergic to peanuts" speaks in under 1 s; the meter shows time to first speech | P0 |
| 3 | The assistant is sure and wrong | 4 (Consumer Reports, Pogue, Wired Mar 2026, Wired Jul 2025) | Citations on research, and the existing agent debate before the answer is kept | `web_research`, `ask_agora` | Ask a checkable household question; the screen shows the sources, the voice stays at two sentences | P0 |
| 4 | People want a checkpoint before an agent acts | 2 surveys (Stack Overflow: 63% rarely or never on autopilot, 60% block unapproved changes; Menlo: 32% have allowed one unsigned action) | Two-step approval. Stateless MCP cannot elicit, so the tool returns `needs_approval` | `approve_action`; `plan_and_run` and `forget` return an `approvalId` | Forget a memory, or approve the dinner plan, by voice "yes" or by button | P0 |
| 5 | A stored fact disappears | 2 (Consumer Reports recipe gone after two weeks; Amazon's own "ask her to remember" promise) | Household memory you can read, edit, and delete | `remember`, `recall`, `forget`, resource `agora://memory` | Remember the peanut allergy, recall it, open `agora://memory`, then forget it only after approval | P0 |
| 6 | Help with the recurring household loop (meals, lists, parents) | 1 survey (Menlo: meal planning and household logistics; 84% of parents use AI) plus the broken to-do and routine reviews above | Morning briefing with no model call, and a task list | `daily_briefing`, `add_task`, `list_tasks`, `complete_task` | "What's my briefing?" Answer is fixed logic, spoken short, with the list on screen | P1 |
| 7 | Ads, cloud-only processing, and an upgrade that turned itself on | 4 (Verge on Echo Show ads, a Play review, Implicator on the removed local mode, r/homeassistant silent enablement) | Self-hosted files, no ads, explicit consent before linking | `agora://memory`; approval on side effects; OAuth consent page | Open the memory file on disk. The simulator has no ad slot. Linking is a passcode consent page | P1 |
| 8 | Spoken answers run long (Alexa+ chatty; ChatGPT voice "wordy") | 2 confirmed (one r/alexa title; one r/ChatGPT excerpt). A CNET "chatty" line is unverified | Spoken reply capped at two sentences; detail stays on screen | `speech` text on every tool result (`toSpeech()`) | Briefing and research answers: two spoken sentences, the rest on the receipt card | P1 |
| 9 | People want ChatGPT-class help on the home speaker, and they already use more than one assistant | 4 (two r/amazonecho threads, one r/ChatGPT thread, Menlo: voice "isn't happening on smart speakers"; ChatGPT 60%, Claude 20%, 3.0 assistants per user) | One brain on every surface | `ask_agora` over MCP from Alexa+, Claude, and ChatGPT | The same allergy answer from the simulator and from Claude Code | P1 |
| 10 | Lights, shades, and Hue routines are the loudest room-level failure, and the roadmap has no device tool | Same threads as rank 1, plus the Hue-delay report (lighting groups, "broke a majority of my home automation") | Not in the roadmap. Do not fake a Hue demo | None | Say so in the video: AGORA+ finishes the household job and shows a receipt. It does not claim the Echo's device graph | P1 gap |

## Gaps vs roadmap

Three needs showed up that the current phase list does not ship as their own tool.

1. **Smart-home device control (P1).** Rank 1 and rank 2 are full of lights, Hue, fans, and routines on hardware people already own. Spyglass also says Matter commands for lights and a thermostat were "fast enough," and the slow path was the generative reply. The roadmap's tools are memory, tasks, briefing, research, and a planned run. There is no light, lock, or routine tool. The demo should not pretend to fix Hue. The honest beat is the job Alexa+ also drops: a plan that finishes, a fact that is still there next week, and a receipt.

2. **A local fast path for device commands (P2).** Instant acknowledgement fixes the silence before speech. It does not keep a lamp command off the model. If a later phase adds devices, those commands should stay off the LLM the way Spyglass guessed Matter already does. Not in the tool list today.

3. **An opt-out that survives a silent model switch (P2).** One r/homeassistant title says Alexa+ turned on after a refusal. OAuth consent covers linking AGORA+. It does not cover "keep classic Alexa." Out of scope for this hackathon unless the friction log names it.

Do not cite "62% want proactive assistants." That figure was not in any source opened on 8 Oct 2026. Menlo's 62% is the share of Gen Z AI users who have earned money with AI.

Pogue's Spotify failure (the assistant claimed a playlist it did not make) is covered by rank 1: a receipt with `verified: false` when the read-back does not match. No extra tool.
