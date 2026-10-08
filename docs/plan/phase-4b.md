# Phase 4b: Simulator polish for the demo — a stage layout, a visible MCP trace, and a fast path

Context: Phase 4 works, but on a desktop screen `/alexa` is a narrow phone card with a small off-center ring and a lot of
empty space, and the MCP routing (the point of the Alexa+ track) is hidden inside the transcript. Every request also waits
for the model, even "remember X", so with no model the simulator can do nothing. The demo video is recorded on a
1440×900 desktop in Chrome. Keep everything that works; change layout and add the fast path.

## 1. Fast path (server) — `server/alexaSim/fastPath.ts`
Research (`docs/research/feature-matrix.md`, ranks 2 and gap 2) says slowness is a top complaint and simple commands
should not need a model. Add a rule-based router for unambiguous requests. It still goes through **real MCP `callTool`
over HTTP** (same client and tokens as the model path) — it only skips the model's tool choice.
- `routeFast(utterance, conversation)` → `{ tool, args } | null`, case-insensitive, trimmed, trailing punctuation removed:
  - `remember|note|don't forget` (that)? X → `remember { fact: X }` (keep X's original casing).
  - "what's my briefing", "brief me", "what's on today", "good morning" → `daily_briefing {}`.
  - "add X to my list/tasks/to-do", "remind me to X" → `add_task { title: X }`.
  - "what's on my list", "what are my tasks", "list my tasks" → `list_tasks {}`.
  - "mark X done", "I finished X", "X is done" → `complete_task { taskIdOrTitle: X }`.
  - "plan|organize|schedule …" → `plan_and_run { goal: <whole utterance> }`.
  - "yes / yeah / yep / go ahead / do it / approve" when the conversation has a pending `approvalId` →
    `approve_action { approvalId, decision: 'approve' }`; "no / nope / cancel / don't" → `reject`.
  - Anything else (including compound requests and open questions) → `null` → the existing model path.
- Bridge: after the `ack`, try `routeFast`. On a match, emit the same `tool_call` / `tool_result` / `approval_required`
  events, then `final` whose text is the tool's `speech` (plus "Should I go ahead?" for `needs_approval`). Add
  `route: 'fast' | 'model'` to `final.timings`. Append the turn to the conversation as plain user/assistant text so the
  model keeps context later (append-only; never edit earlier turns).
- Track `pendingApprovalId` on the conversation from any `needs_approval` result (fast or model path); clear it after
  `approve_action`.
- `ALEXA_SIM_FAST_PATH=0` disables it. Add the name to `.env.example` and to the `serverNames` list in `vite.config.ts`.
- Model-path errors get a friendly spoken message: missing AWS credentials → "My thinking model isn't connected on this
  server yet. Simple requests like remembering, tasks and your briefing still work." Keep the technical detail in the
  trace panel, not in speech.

## 2. Stage layout (client) — `src/alexa/`
At ≥ 1024 px wide, a two-column stage that fills the viewport height without page scroll:
- **Left — the device** (landscape, like a smart display, ~16:10): a large centered `StatusRing` (≈ 200–240 px), the
  state label under it, and a live caption area with the last user line and the assistant's spoken line in large type
  (≥ 22 px). A pending approval shows as a prominent card inside the device with Approve / Decline. Below the device:
  Hold-to-talk, the text box, Send, and the sample chips in one tidy row/wrap. The "simulated Alexa+ experience
  (unofficial)" label stays visible in the device header.
- **Right — "Under the hood"**: a header line `MCP · Streamable HTTP · 2025-11-25 · auth: <dev-token|OAuth linked>` and
  the `LatencyMeter` at the top (time to first speech, last and median), with a small reference line
  "Reported Alexa+ wait: up to 15 s (Spyglass, Sep 2025)" linking to the source from `docs/research/sources.json`.
  Then a per-turn timeline, newest first: utterance → `ack` (ms) → route chip (`fast path · no model` or
  `Claude on Bedrock`) → each `tools/call` with status chip, `speech`, receipt `verified ✓`, ms → final (total ms).
  Reuse `ReceiptCard` for the tool rows. Errors show their technical detail here.
- Below 1024 px: stack (device first, trace second); at 375 px nothing overflows horizontally.
- Keep accessibility: aria-live caption, visible focus rings, keyboard-only use, `prefers-reduced-motion`.
- Visual polish: consistent spacing scale, aligned baselines, no orphaned labels, subtle depth on the device
  (bezel + soft shadow), tabular numbers for ms values, smooth but short transitions (≤ 200 ms). Use only AGORA tokens.

## Tests
- `fastPath` unit tests for every rule, including casing preserved in `remember`, and `yes` with/without a pending approval.
- Bridge test: with the model `create` throwing (no credentials), "remember X" still completes through the fast path with a
  verified receipt and `route: 'fast'`; "tell me a joke" yields the friendly model-unavailable message.

## Acceptance
- The full gate passes and `npm run test:e2e` passes for Chromium and Firefox.
- With no AWS credentials, at `/alexa` (1440×900): "Remember Mia is allergic to peanuts" → verified receipt via the fast
  path; "What's my briefing?" → spoken briefing; "Plan dinners for this week" → approval card; "yes" → run started.
  Take a screenshot at 1440×900 and at 375×812 into `docs/images/alexa-sim-desktop.png` and `docs/images/alexa-sim-mobile.png`.
