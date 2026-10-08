# W4 voice UX

The voice page, the Household panel, the office header, and the Echo Show card. The butter-on-ink device is unchanged.

## What changed

- `src/alexa/turnTiming.ts` — the latency clock records milliseconds only when audio starts. If the turn ends and nothing played, the sample is text only. The caption keeps the acknowledgement until that line finishes, then shows the answer. The approval text prefers the longer of the summary and the speech, so a clipped "Forget: …" line does not hide the full fact. A whole-phrase no (no, nope, nah, decline, cancel) is a decline; "no but not Tuesday" is not.
- `src/alexa/LatencyMeter.tsx` — the line says "time to first audio". A turn with no audio says "text only" instead of a number.
- `src/alexa/useSpeechOutput.ts` — `onStart` runs from `playing` or speech-synthesis `onstart` only. A missing engine, a failed play, or a muted audio element does not count as audio.
- `src/alexa/useSpeechInput.ts` — reads the recognition error. "Microphone blocked", "Didn't catch that", and "Network error". Releasing outside the button, a cancelled pointer, or leaving the window ends the hold. Words heard before a final result are still submitted.
- `src/alexa/AlexaSimulator.tsx` — caption follows the clock above. Hold to talk and Space stop current speech before listening. Stop is on screen while Agora is speaking, and Escape stops speech. An approval is an `alertdialog`; focus moves to Approve, Escape declines, and focus returns to Hold to talk. The card shows the full summary. The dev-token pill is hidden unless `?debug=1`. Document title is "AGORA+ voice (unofficial Alexa+ simulator)". Caption fades respect reduced motion. The Spyglass line also cites 3–5 s for simple commands (The Verge, Oct 2026) and calls the meter time to first audio. Chips include "What is Mia allergic to?" and "Add milk to my shopping list". While the page is open it polls `GET /api/household` every 30 seconds.
- `src/alexa/announcements.ts` — reminder and run-completion rules. An open task with `dueAt` in the past is due. A task that was already due more than an hour before the page opened is not announced. Each task and each finished run is spoken once per page load. A run counts when it started at or after the approval and its status is no longer `running` (still-going also includes `cancel_requested`).
- `src/alexa/ReceiptCard.tsx` — the step list stays visible. Approve and Decline on the trace are not shown, so the device card is the only pair.
- `src/interface/householdView.ts` — reads optional `who`, `list`, and `dueAt`. Tasks group as To-do, then Shopping, then any other list. `dueAt` is local time.
- `src/interface/HouseholdPanel.tsx` — name chips, those groups, and the local time. Delete asks "Delete? Yes / No" on the row. No `confirm()`. Meta text, the close control, and Delete are dark enough for the cream panel. The panel is a dialog; Escape closes it, and Escape cancels a pending delete first.
- `src/interface/Header.tsx` — Household and Voice have `aria-label`s. At desktop width the words Household and Voice are visible. Voice's label says it opens a new tab.
- `src/main.tsx` — sets the voice document title before the simulator loads.
- `public/privacy.html`, `public/terms.html` — the kicker is `#665e4b`. Links are underlined.
- `server/mcp/apps/householdCard.ts`, `householdCardState.ts`, `householdCard.html` — a failed tool call replaces "Loading…" with empty lists and the error in the speech line and the note. The speech line is a polite live region. The task line shows a person, a list, and `dueAt` when they are present. A content-security-policy meta tag allows the inline script and styles the card needs, and host fonts over https. `connect-src` is none because the card talks to the host with `postMessage`.
- `server/mcp/apps/cardHtml.ts` — rebuilds the card when `householdCardState.ts` changes.
- `vitest.config.ts` — includes `src/alexa` and `src/interface` tests. That file is not on the ownership list. Without this line the new tests never run.

## Finding IDs

Closed: UX-5, UX-6, UX-7, UX-8, UX-9, UX-10, UX-11, UX-13, UX-14, VOC-3, VOC-6, VOC-8, SEC-11 (the panel confirm only).

JDG-5 is only the on-screen latency line. The README still tells a judge to open the office first.

## Contracts

1. The panel and the Echo card show `who`, `list`, and `dueAt` when the payload has them. Absent `list` is the To-do group.
5. The open simulator polls about every 30 seconds, speaks "Reminder: <title>." once per task, and skips tasks that were due more than an hour before the page opened. A quiet toast shows the same line.
6. After a yes (the approval card is up and the utterance is not a whole-phrase no, or the final event includes `runId`), the simulator watches `recentRuns` for a run that started at or after that moment. When the status leaves `running`, it speaks `spokenSummary` once and shows it in the toast.

## Needs from others

- W1: put `runId` on the final event when a turn starts a run. Send the full forget fact in `summary` (it is still clipped to 80 characters in `actions.ts`). The voice page will show whichever of summary and speech is longer.
- W1 or W2: `DELETE /api/memory/:id` still deletes with no approval record. The panel now asks Yes/No, then calls that same route.
- W3: route "What is Mia allergic to?" and "Add milk to my shopping list" on the fast path. Store `who`, `list`, and `dueAt`. The chips are already on the page.
- W5: `recentRuns` newest first, with `id`, `status`, `startedAt`, and `spokenSummary` when there is one. A run should be `running` when it starts and something else when it ends.
- Docs: point the quick start at `/alexa` (JDG-5). The dev-token pill is hidden unless the URL has `?debug=1`.

## Friction

- Expected `npm test` to pick up a test next to `src/alexa`. The vitest include list did not. Workaround: one include line in `vitest.config.ts`.
- Obscura MCP refuses `127.0.0.1`. The CDP socket on port 9222 answered "No page for session". Workaround: `obscura fetch --allow-private-network` for the title, and Playwright for 1024×768 and 390×844.

## Left undone

- The passcode overlay is marked as a dialog. Focus does not move into it, and Escape does not dismiss it.
- The Household panel has no focus trap.
- A muted browser tab is not visible to the page. "Text only" means playback never started.
- "What did you just say?" is not a fast path here. That phrase belongs with W3.
- Reminders and a finished run were not spoken in the browser. The rules are unit-tested. The page check was the idle simulator: title, both citations, both chips, no dev-token pill, no console errors, no horizontal scroll at 390px.
