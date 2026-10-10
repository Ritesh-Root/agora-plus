# Phase 7: a household Home instead of the office

AGORA+ is a home assistant, upgraded. Today the front door (`/`) is the 3D "office" from the original
AGORA (Creative Studio desks, agents walking around), and the household lives in a modal and on a dark
"voice simulator" page. That reads like a developer tool. This phase makes **`/` a light, friendly
household Home**: talk to the assistant, see today, the lists, the family, and the plans the team made.
The office stays reachable at `/office` as an optional view. Nothing in `src/simulation/**` changes.

Read first: `src/main.tsx`, `src/alexa/AlexaSimulator.tsx` (all of it), `src/alexa/*.ts(x)`,
`src/interface/HouseholdPanel.tsx`, `src/interface/householdView.ts` (+ test), `src/interface/Header.tsx`,
`src/index.css`, `server/routes.ts`, `server/household/taskStore.ts`, `server/household/actions.ts`,
`server/household/briefing.ts` (`isSafetyFact`), `server/runEngine.ts` (`RunRecord`), `e2e/alexa.spec.ts`,
`video/demo/capture.mjs`.

## 1. Routing (`src/main.tsx`)
- `/` and `/alexa` (and `/alexa/*`) render the new Home (lazy import, no three.js in that chunk).
  Keep the `?linked=1&code=…&state=…` OAuth return working on both paths (today it only works on `/alexa`;
  after finishing, `history.replaceState` to the path it arrived on).
- `/office` renders the existing `App` (3D office). Everything else falls back to Home.
- Document title on Home: `AGORA+ Home`.
- Check that `server/prod.ts` serves `index.html` for `/office` (it falls back today; keep it that way).

## 2. Split the voice logic from its layout
`AlexaSimulator.tsx` is 900+ lines of state, speech, mic and SSE handling plus a dark layout.
- Move all state and behaviour **verbatim** into a hook `src/alexa/useAssistant.ts` that returns what the
  UI needs (turns, phase, ring state, caption, toast, busy, speaking, listening, interim, supported,
  blocked, micNote, status, linkNote, locked, samples, approval card + copy, and the handlers:
  submit, decide, pressRing, haltSpeech, link, unlock, the talk-button pointer handlers, refs for the
  approve and talk buttons). Do not change the logic: the race fixes in there are deliberate
  (turn serials, `silenced`, focus handling, tap vs hold, Space/Escape keys, household watch).
- Delete the old dark layout. `AlexaSimulator.tsx` either goes away or becomes a one-line re-export of
  Home; nothing else may import the dark layout.

## 3. The Home page (`src/home/`)
New files (names are suggestions, keep each under ~300 lines):
`HomePage.tsx`, `AssistantCard.tsx`, `TodayCard.tsx`, `ListCard.tsx`, `FamilyCard.tsx`, `PlansCard.tsx`,
`ApprovalsCard.tsx`, `UnderTheHood.tsx`, `PlanSheet.tsx`, `ConnectSheet.tsx`, `useHousehold.ts`.

### Look and feel
- Light only. Keep the brand tokens in `src/index.css` (paper `#fcfaf4`, ink, butter `#f2cc46`, the warm
  zinc scale). Page background `#f4f0e6` (warm bone). Cards are paper with a soft layered shadow
  (`0 1px 2px rgba(23,21,15,.06), 0 8px 24px -12px rgba(23,21,15,.12)`), radius `1.75rem`, padding 20–24px,
  no heavy borders. Nested radii are concentric (inner = outer − padding).
- Add two semantic tokens to `@theme`: `--color-sage: #4f7a5a` (done / verified) and
  `--color-coral: #c4553a` (allergy / safety / destructive). Use butter for "waiting for you".
- Typography: sentence case. Section titles 15–16px semibold ink, not tiny uppercase tracking labels.
  Body 14–15px. Small meta 12–13px zinc-500. `text-wrap: balance` on headings, `tabular-nums` on times.
  Drop the `font-black uppercase tracking-widest` button style on Home; buttons are 14px medium,
  sentence case ("Add", "Approve", "Read plan").
- Icons: `lucide-react` only, 18px, stroke 1.75. Every icon-only button has an `aria-label` and a
  40×40 hit area. Buttons scale to 0.96 on press. Transitions name their properties (no `transition-all`),
  150–200 ms, honour `motion-reduce`.
- Friendly copy, no jargon on the main surface. MCP, OAuth, model names, timings live in "Under the hood".

### Layout
Desktop (≥1024px): a top bar, a greeting/briefing strip, then two columns.
- **Top bar** (sticky, 64px, paper with a hairline bottom border): left "AGORA+" wordmark with a small
  butter house glyph and the word "Home"; right: the date and time ("Sat 10 Oct · 7:42 pm", updates each
  minute), a "Connect" button (opens ConnectSheet), an "Under the hood" button (code icon + label on wide
  screens, opens the drawer). A quiet text link "Team view (3D)" to `/office` sits in the footer, not the bar.
- **Greeting strip**: "Good morning / afternoon / evening." (local hour) as a 28–32px heading, then the
  briefing `suggestions` from `/api/household` as soft chips (safety lines like "Remember: Mia is allergic
  to peanuts." get a coral dot; reminders a butter dot). If empty: "Nothing urgent at home."
- **Left column (~420px, sticky on desktop): AssistantCard** — the device, light version:
  - Header row: "Assistant" + a small chip "Simulated Alexa+ voice · unofficial" (keep this honesty label)
    and the link state ("Linked ✓" in sage, or a "Link AGORA+" button). Show the auth mode chip only with
    `?debug=1`, as today.
  - The StatusRing (make it work on a light surface: idle = soft butter ring on paper, listening = butter
    pulse, thinking = slow butter sweep, speaking = ink/butter wave, approval = amber, error = coral).
    The ring is still the main button (`data-testid="alexa-ring"`, same aria labels).
  - Ring label, then the caption block (`data-testid="alexa-caption"`, `aria-live="polite"`): the user's
    line in zinc-500, the assistant's line 18–20px ink.
  - Under the caption, the **latest receipt** in one quiet line when the last turn wrote something:
    sage check + "Saved to memory · verified" / "Added to Shopping · verified" (from the tool card receipt).
  - Toast (`data-testid="alexa-toast"`) as a soft butter-tinted note.
  - Approval card (`data-testid="alexa-approval"`, role alertdialog, same ids) in butter-50 with the plan
    steps as a numbered list when the summary has "Plan: N steps — a; b; c", else the text.
    Buttons "Approve" (ink, primary) and "Decline" (quiet). Keep focus-on-approve behaviour.
  - Controls: the talk button (`id="talk-btn"`, mic icon, butter, label "Tap to talk" / "Listening…" /
    "Tap to send" / "Mic unavailable"), a Stop button while speaking (`data-testid="alexa-stop"`),
    the text box (`id="alexa-utterance"`, placeholder exactly `Type a request`) with a send button whose
    accessible name is exactly `Send`, the mic note (`data-testid="alexa-mic-note"`).
  - Suggestion chips (same SAMPLES) in a wrap row, quiet style.
  - One-line hint at the bottom in zinc-500: "Tap the ring or hold Space to talk. Esc stops."
  - A tiny meter line "57 ms to first audio" (latest sample, tabular-nums) that opens Under the hood on click.
- **Right column**: a responsive grid (1 column under 1280px, 2 columns above), in this order:
  1. **ApprovalsCard** — only when `pendingApprovals` is non-empty: butter tint, "Waiting for you",
     each approval with its summary (numbered steps for plans) and Approve / Decline buttons that call
     `POST /api/approvals/:id` like HouseholdPanel does. Full width.
  2. **TodayCard** — "Today": open tasks that have `dueAt` (or `due` today / overdue), sorted by time.
     Each row: time ("6:00 pm", tabular-nums), title, who chip, relative label ("in 8 min", "overdue")
     with overdue in coral. A round checkbox completes it. Empty: "No reminders today."
  3. **ListCard "Shopping"** — open items with a round checkbox; checking calls complete and the item
     moves to a collapsed "In the basket (n)" group with strike-through, which can be unchecked (reopen)
     or cleared ("Clear basket" removes all done shopping items). An inline "Add an item" field
     (Enter adds with `list: "shopping"`). Each row has a remove button on hover/focus (x icon).
  4. **ListCard "To-do"** — same component for tasks without a list (and any other list name gets its
     own card titled with the list name). Add field sends no list.
  5. **FamilyCard** — "Family": memory grouped by `who` (one block per person: avatar circle with the
     initial on a soft per-person tint, name, then their facts as rows). Facts with no `who` go under
     "Home". Safety facts (allergy, medicine, diet — mirror `isSafetyFact` from
     `server/household/briefing.ts` as `safetyKind(text, tags)` in `householdView.ts` returning
     `'allergy' | 'diet' | 'medical' | null`) show a coral "Allergy" / sage "Diet" / coral "Medical"
     badge and sort first. Edit in place: click a fact (or its pencil button) to edit, Enter saves via
     PATCH, Esc cancels; a trash button asks "Delete?" inline (Yes / No), as HouseholdPanel does.
     "Add a fact" field at the bottom (the server infers `who` from the text). Full width.
  6. **PlansCard** — "Plans": the newest household runs (max 5). Each: brief, status pill
     (Working… butter with a subtle pulse / Done sage / Stopped zinc / Needs a look coral), relative time.
     For a **running** plan, show the team at work instead of the 3D office: the four members from
     `server/household/team.ts` (Agora lead, Scout research, Planner logistics, Keeper checks memory) as
     small avatar circles, then the plan's tasks as rows "role avatar · task title · status"
     (queued / working / done / needs help); empty role shows "Team". For a finished plan: the
     `spokenSummary` as the lead sentence (allergy/conflict words highlighted coral), "Read plan"
     (opens PlanSheet) and "Download .md" (`/api/runs/:id/document`). Full width.
     `parseSnapshot` must keep each run's `tasks`, `finishedAt`, `error` and `source` so this works;
     only show `source === 'household'` runs (fall back to all when the field is missing).
- **PlanSheet**: a right-side sheet (or centered dialog on mobile) that fetches the run's markdown from
  `/api/runs/:id/document` and renders it with `react-markdown` + `remark-gfm` (already dependencies),
  readable typography (max-width ~68ch), Esc / backdrop closes, focus is trapped and returned.
- **UnderTheHood**: a right drawer (~460px, light paper, not dark) with what the old dark sidebar had:
  "MCP · Streamable HTTP · 2025-11-25 · auth: …", the LatencyMeter, the Spyglass / Verge source line,
  and the per-turn trace (utterance, ack + ms, "fast path · no model" / model route chip, `tools/call`
  ReceiptCards, error detail, final ms). Keep `data-testid="alexa-trace"` on the drawer panel. Restyle
  `ReceiptCard` for a light surface (it is only used here and in HouseholdPanel). The drawer stays
  mounted (hidden with `hidden`/`inert` when closed) so the trace keeps its history.
- **ConnectSheet**: "Use your household from anywhere": the MCP endpoint `${location.origin}/mcp`, a copy
  button, and the Claude Code command
  `claude mcp add --transport http agora ${location.origin}/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"`
  with a copy button, plus one line each for Alexa+ (see `skills/agora-household/references/ALEXA_ADDON.md`)
  and ChatGPT/Claude apps (remote MCP connector). Never show a token value.
- **Locked household**: when `/api/session` says a passcode is required (or any call returns 401), show a
  centered light card with the passcode form (reuse the PasscodeForm logic) over a blurred page.
- **Mobile (<1024px)**: one column: top bar (date hidden under 640px), greeting, AssistantCard (not sticky),
  approvals, today, shopping, to-do, family, plans, footer. 16px side gutters, no horizontal scroll.

### Data
- `useHousehold()` polls `GET /api/household` every 2.5 s (pause while `document.hidden`), parses with
  `parseSnapshot`, exposes `{ snapshot, locked, error, refresh }` plus mutation helpers (add/patch/delete
  memory, add/complete/reopen/remove task, decide approval). After a mutation, refresh at once.
- HomePage calls `refresh()` whenever an assistant turn finishes (busy → false), so "Add milk" appears in
  the Shopping card immediately.
- Optimistic checkbox toggles are fine; roll back and show a quiet note if the call fails.

## 4. Small server additions (household tasks)
- `server/household/taskStore.ts`: `reopenTask(id)` (done → open, clears `completedAt` if present) and
  `removeTask(id)`; both return the task or null. Atomic writes like the rest of the store.
- `server/household/actions.ts`: `reopenTask` and `removeTask` wrappers that return receipts
  `{ action, id, verified, at }` with `verified` from a read-back, like `completeTask` does.
- `server/routes.ts`: `POST /api/tasks/:id/reopen` and `DELETE /api/tasks/:id` (same lock, same-origin and
  id checks as the existing task routes; 404 when unknown). Tests in `server/routes.test.ts` and
  `server/household/taskStore.test.ts`.
- No MCP tool changes.

## 5. The office becomes optional
- `src/interface/Header.tsx`: replace the "Household" modal button and the "Alexa+ Simulator" link with one
  "Home" link to `/` (keep `data-testid="household-btn"` on it). Remove `HouseholdPanel.tsx` and its
  `isHouseholdOpen` store fields if nothing else uses them. Keep `householdView.ts`.
- `video/demo/capture.mjs` and docs that say the office is at `/`: change them to `/office`.
- README: the quickstart says open `/` for the household Home and `/office` for the optional 3D team view.
  Update `docs/DEMO_SCRIPT.md` the same way. Keep edits small.

## 6. Tests
- `src/interface/householdView.test.ts`: `safetyKind`, grouping memory by person (Home bucket for no
  `who`, safety facts first), run parsing keeps tasks/finishedAt/source, `relativeDue` ("in 8 min",
  "overdue") with an injected `now`, greeting by hour, plan-step splitting ("Plan: 4 steps — a; b; c; d").
  Put pure helpers in `householdView.ts` (or `src/home/homeView.ts`) so they are testable.
- Update `e2e/alexa.spec.ts` for the new page:
  - go to `/`, title `/AGORA\+ Home/`, "Linked" visible;
  - open "Under the hood" before checking `verified ✓` receipts (they live in the drawer), or assert the
    inline latest-receipt line instead, but keep the approval checks and the `toHaveCount` logic correct;
  - replace the office/household-panel step with: the Shopping card on Home shows `milk`;
  - add a check that `/office` still loads (canvas or the join form is visible) without page errors.

## Acceptance
- `npm run lint && npm run lint:server && npm test && npm run build` pass.
- `npm run test:e2e` passes (it starts its own server; read `playwright.config.ts`).
- The Home chunk does not import three.js (`npm run build` output: the Home entry chunk stays small; say its size).
- No dark surfaces on Home or in its sheets/drawer.
