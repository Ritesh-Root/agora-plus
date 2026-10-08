# Frontend, voice UX and accessibility report
Summary: The voice page is honest about being an unofficial simulator, and butter yellow on the dark device passes WCAG AA. The demo’s memory story does not. On the running server the peanut allergy is saved, and “What’s my briefing?” still says “Nothing urgent at home.” The office cut still shows the Creative Studio cast, so Keeper is not a person on screen. Keyboard focus, the latency label, and a qualified “yes” will also look wrong if a judge pokes them.

## Findings

### UX-1 The scripted briefing does not mention saved facts
- Severity: P1
- Area: `server/household/briefing.ts`, voice page and Household panel
- Evidence: `server/household/briefing.ts:72-81` only speaks overdue tasks, tasks due today, waiting approvals, or “Nothing urgent at home.” Memory is used when `input.memory.length === 0`, and then only as the suggestion “Tell me a preference or allergy to remember.” On 8 Oct 2026 the running server’s `GET /api/household` had three memory rows, each “Mia is allergic to peanuts”, no open tasks, and `suggestions: []`. `POST /api/alexa-sim/turn` with “What’s my briefing?” returned `speech` “Nothing urgent at home.” and route `fast`. `docs/DEMO_SCRIPT.md:63-64` says that after remember, “the line should mention what is actually saved.”
- Why it matters: This is the 1:30 beat. The page will sound like it forgot the allergy, which is the complaint the pitch is answering. Impact, and Quality of idea.
- Fix: Add one spoken sentence drawn from saved memory (the allergy, if present) before the “nothing urgent” fallback, and show that same line in the panel’s Briefing section.
- Effort: S
- Confidence: high

### UX-2 The “What is Mia allergic to?” chip does not use memory
- Severity: P1
- Area: `src/alexa/AlexaSimulator.tsx`, `server/alexaSim/fastPath.ts`
- Evidence: The chip is in `src/alexa/AlexaSimulator.tsx:12`. `server/alexaSim/fastPath.test.ts:112` expects `routeFast('what is Mia allergic to?', none)` to be null, so the turn goes to the model. With no model, `server/alexaSim/bridge.ts:18` speaks “My thinking model isn't connected on this server yet.” The ack is still “Let me check.” because `server/alexaSim/ack.ts:40` treats the word “what” as a question. Recall itself is not in the fast-path sets in `server/alexaSim/fastPath.ts:13-14`.
- Why it matters: The chip sits on screen for the whole voice demo. Clicking it without Bedrock sounds like the assistant cannot remember. The script does this question in Claude Code, not on this page. Technical implementation and Impact.
- Fix: Route “what is Mia allergic to?” through `recall` on the fast path, and speak the saved fact. Hide or relabel the chip until that works.
- Effort: S
- Confidence: high

### UX-3 The office cut does not show the household team
- Severity: P1
- Area: `/` header and office roster
- Evidence: `src/data/agents.ts:26` sets `DEFAULT_AGENTIC_SET_ID` to `'single-agent'`, which is not a set id, so `getAgentSet` falls through to `AGENTIC_SETS[0]`, `teamName: 'Creative Studio'` at `src/data/agents.ts:86-98`, led by “Creative Director”. `server/household/team.ts:3-18` names Agora, Scout, Planner, and Keeper, but those strings are not in `src/data/agents.ts`. `src/network/NetworkClient.ts:39-43` maps a task role onto a character only when the name matches the active set, otherwise `agents[0]`. On 8 Oct 2026 the live `/` document title was “AGORA”. `docs/images/agora-room.jpg` shows Creative Director, Developer, Designer, and Copywriter.
- Why it matters: `docs/DEMO_SCRIPT.md:51-55` tells the recorder to cut to `/` and say Keeper catches the allergy. The idle office is still a creative agency, and a household role name does not select a Keeper character. Design and Impact.
- Fix: Ship a household team whose names match `HOUSEHOLD_TEAM`, and make it the set the office loads for this demo.
- Effort: M
- Confidence: high

### UX-4 A qualified yes is spoken as approval
- Severity: P1
- Area: `server/alexaSim/ack.ts` versus `server/alexaSim/fastPath.ts`
- Evidence: `server/alexaSim/ack.ts:27-38` splits on non-letters and treats any word `yes` as “Okay, going ahead.” `server/alexaSim/fastPath.ts:11` approves only the whole phrase, after folding, for example `yes` or `yes, go ahead`. “yes, but not Tuesday” contains the word yes, so the ack fires, and the phrase is not in `APPROVE`, so `routeFast` returns null and the model (or the offline line) decides. “yesterday” is one word, so it is not a yes: the ack stays “On it.” and the fast path does not approve. `server/alexaSim/conversation.ts:11` tells the model “When the user then says yes or no, call approve_action.”
- Why it matters: Someone who says “yes, but not Tuesday” hears “Okay, going ahead.” before anything is decided. With Bedrock on, the prompt pushes the model to treat that as a yes. Technical implementation.
- Fix: Use the same whole-phrase check for the ack and the fast path. A sentence that merely contains “yes” should ask for a clear yes or no.
- Effort: S
- Confidence: high

### UX-5 The meter’s “first speech” is often the ack text, not audio
- Severity: P1
- Area: `src/alexa/LatencyMeter.tsx`, `src/alexa/AlexaSimulator.tsx`
- Evidence: The label is `src/alexa/LatencyMeter.tsx:22`: “Last turn ${last.ttfsMs} ms to first speech, ${last.finalMs} ms to the answer.” `src/alexa/AlexaSimulator.tsx:209-212` stores `ttfsMs ?? ackAt ?? finalMs`. `ttfsMs` is set only in the audio `onStart` at lines 242-244. `rememberSample` runs at line 294, when the `final` event arrives, which is before `speak(data.text)` at line 295. If the ack has not started playing, the first number is `ackAt`, the moment the ack text arrived. The trace then replaces that client time with the server’s `ackMs` at line 290 (`serverAck || turn.ackMs`). The briefing turn on 8 Oct 2026 reported server `ackMs` of 1 and `totalMs` of 103. `docs/images/alexa-sim-desktop.png` shows the meter reading “15 ms to first speech”. `docs/plan/phase-4.md:77-78` asked for time to first audio `playing`.
- Why it matters: The demo tells the recorder to read this meter (`docs/DEMO_SCRIPT.md:29-32`). A judge who knows speech cannot start in 15 ms will not trust the number. Technical implementation.
- Fix: Record `ttfsMs` only from `onStart` / `playing`, and label the ack-text time separately. Do not overwrite the client ack time with the server clock.
- Effort: S
- Confidence: high

### UX-6 The device caption drops the acknowledgement while it is still being said
- Severity: P1
- Area: `src/alexa/AlexaSimulator.tsx`, `src/alexa/useSpeechOutput.ts`
- Evidence: The ack sets `spoken` to the ack text at `src/alexa/AlexaSimulator.tsx:236-244` and queues speech. The `final` event replaces `spoken` with the answer at lines 287-295 and queues that line after the ack. `src/alexa/useSpeechOutput.ts:124-131` plays the queue in order, so the ear still hears the ack, then the answer. The caption live region (`src/alexa/AlexaSimulator.tsx:425-429`) shows only `latest.spoken`. A fast turn (the briefing finished in 103 ms server-side) replaces “Here's your day.” before it can be read. The trace keeps the ack line.
- Why it matters: `docs/DEMO_SCRIPT.md:28-29` says the acknowledgement must be on screen. On the device it is a flash. Design.
- Fix: Keep the ack on the device until that audio ends, then show the answer.
- Effort: S
- Confidence: high

### UX-7 Starting to talk does not stop Agora
- Severity: P1
- Area: `src/alexa/useSpeechInput.ts`, `src/alexa/AlexaSimulator.tsx`
- Evidence: `useSpeechOutput` stops audio only when `stop()` runs (`src/alexa/useSpeechOutput.ts:88-94`). The simulator calls `stop()` at the start of `submit` (`src/alexa/AlexaSimulator.tsx:205`), not when listening starts (`src/alexa/useSpeechInput.ts:22-24`). The ring prefers listening over speaking (`src/alexa/AlexaSimulator.tsx:353-356`), so the screen can say “Listening” while the previous line is still playing.
- Why it matters: Hold-to-talk and Space feel like a conversation, but the assistant talks over the user until the phrase is submitted. Design.
- Fix: Call `stop()` from the speech-output hook at the start of `start()`.
- Effort: S
- Confidence: high

### UX-8 Approval is easy to miss from the keyboard
- Severity: P1
- Area: `src/alexa/AlexaSimulator.tsx`, `src/interface/HouseholdPanel.tsx`
- Evidence: The caption is the only live region (`src/alexa/AlexaSimulator.tsx:425`, observed on the live page: one `aria-live="polite"`). The approval card at lines 431-453 has no `role`, no live region, and nothing calls `focus()`. The plan steps live on that card (`approval.summary`); the spoken line is the tool’s `speech` plus “Should I go ahead?” from `server/alexaSim/bridge.ts:153-157`, not the step list. The same Approve and Decline pair is repeated on the receipt (`src/alexa/ReceiptCard.tsx:62-82`). The Household panel (`src/interface/HouseholdPanel.tsx:182-193`) is a backdrop with no `role="dialog"`, no `aria-modal`, and no focus move. The passcode overlay at `src/alexa/AlexaSimulator.tsx:574-580` is the same. Escape closes the panel (`src/interface/HouseholdPanel.tsx:105-110`) and does not close the passcode overlay.
- Why it matters: A keyboard or screen-reader user hears the question and is not taken to Approve. Focus can sit behind either overlay. Technical implementation, Design.
- Fix: On approval, focus Approve and wrap it in `role="alertdialog"`. On close, return focus to the text box. Do the same for both overlays, and keep a single pair of buttons.
- Effort: M
- Confidence: high

### UX-9 Microphone errors are silent, and the hold button can stick
- Severity: P1
- Area: `src/alexa/useSpeechInput.ts`, `src/alexa/AlexaSimulator.tsx`
- Evidence: `src/alexa/useSpeechInput.ts:41-43` sets listening to false on any error and does not read `event.error`. There is no “microphone blocked” line. The only fallback sentence is `src/alexa/AlexaSimulator.tsx:462`, “Speech recognition needs a Chromium browser. Type below.”, and it renders only when both constructors are missing. `onend` (lines 44-50) submits `finalText` and drops interim text. The hold button (`src/alexa/AlexaSimulator.tsx:469-474`) starts on pointer down and stops on pointer up or cancel on that button. It never calls `setPointerCapture`, so a release outside the button does not run `stop()`. MDN, fetched 8 Oct 2026: “This feature is not Baseline because it does not work in some of the most widely-used browsers.”
- Why it matters: A denied mic looks like a dead button. A drag off the yellow button can leave the ring on Listening. Design.
- Fix: On `not-allowed`, show one sentence and leave the text box focused. On pointer down, capture the pointer and stop on lost capture. If the user releases before a final result, submit the interim text.
- Effort: S
- Confidence: high for the missing error text; medium for the stuck pointer (not reproduced on a device mic)

### UX-10 Amber on the dark device passes; several other colours and the talk-button focus ring do not
- Severity: P1
- Area: palette in `src/index.css`, privacy and terms, Household panel, talk button
- Evidence: WCAG relative luminance, from the hex in `src/index.css:11-15` and `src/index.css:23-26`. `#f2cc46` on `#17150f` is 11.73:1. `#17150f` on `#f2cc46` is 11.73:1. `#d9af1b` on `#17150f` is 8.78:1. Paper at 60% opacity on `#17150f` composites to about `#a09e98`, 6.81:1. Those dark-device pairs pass AA for normal text (4.5:1). Failures: `#d9af1b` on `#efebe0` is 1.75:1, and that is the privacy kicker (`public/privacy.html:29`, measured live as `rgb(217, 175, 27)` at 11.52px on `rgb(239, 235, 224)`). The same rule is in `public/terms.html:29`. `#857d66` (`zinc-400`) on `#fcfaf4` is 3.93:1, used for panel labels and empty lines (`src/interface/HouseholdPanel.tsx:188` and `:220`). `#b3aa8f` (`zinc-300`) on `#fcfaf4` is 2.22:1, below the 3:1 non-text bar, on the close icon (`src/interface/HouseholdPanel.tsx:190`). `text-red-400` is not remapped in `src/index.css`; Tailwind’s `#f87171` on `#fcfaf4` is 2.65:1 (`src/interface/HouseholdPanel.tsx:216`). The talk button’s focus ring is `outline-paper` (`src/alexa/AlexaSimulator.tsx:475`) on the page background `#fcfaf4`, so the ring matches the page. Cream-side controls use `outline-butter-600` (`src/alexa/AlexaSimulator.tsx:20`), and `#d9af1b` on `#fcfaf4` is 1.99:1. Privacy links are `a { color: #17150f; }` with no underline (`public/privacy.html:33`); live computed `text-decoration-line` was empty and the colour matched the body.
- Why it matters: The device yellow is fine. The legal pages, the Household empty states, Delete, and keyboard focus on Hold to talk are not. Design, and the pages a judge opens for the privacy URL.
- Fix: Darken the kicker to ink or `#665e4b` (6.16:1 on `#fcfaf4`). Use `zinc-500` or darker for panel meta text. Give the close control and Delete a 24px target and a colour that clears 4.5:1. Outline the talk button with `#17150f`. Underline the privacy and terms links.
- Effort: S
- Confidence: high

### UX-11 Household and Voice are unlabeled 24px icons
- Severity: P1
- Area: `src/interface/Header.tsx`
- Evidence: `src/interface/Header.tsx:237-254`. Live on 8 Oct 2026 at 1280×720: `household-btn` and `voice-sim-btn` were 24×24, `title` set (“Household”, “Voice simulator”), `aria-label` null, no visible text. They sit in a row with Fullscreen, Negotiation, and Model connections, also 24×24. The voice link is `target="_blank"`.
- Why it matters: `docs/DEMO_SCRIPT.md:67` says to open Household from the office header. In the first seconds of `/` those controls read as a tool strip, not as the product. Design.
- Fix: Use visible text buttons, “Household” and “Voice”, at least 24px tall, with `aria-label`s. Say when Voice opens a new tab.
- Effort: S
- Confidence: high

### UX-12 Repeating “remember” stores the same fact again
- Severity: P2
- Area: `server/household/actions.ts`, `src/interface/HouseholdPanel.tsx`
- Evidence: `remember` always calls `addMemory` (`server/household/actions.ts:111-114`). The panel prints every row (`src/interface/HouseholdPanel.tsx:206-218`). The live household had the peanut line three times. Delete is immediate (`src/interface/HouseholdPanel.tsx:216`), which matches the script’s “delete it and add it again” but has no confirm.
- Why it matters: Opening Household on this server shows three identical allergies. A second demo take makes a fourth. Design.
- Fix: If the same text is already saved, say so and do not append. Clear the extra rows before recording.
- Effort: S
- Confidence: high

### UX-13 The Echo Show card stays on “Loading” when the tools fail
- Severity: P2
- Area: `server/mcp/apps/householdCard.ts`, `server/mcp/apps/householdCard.html`
- Evidence: `server/mcp/apps/householdCard.ts:234-237` sets `state.note` and returns. `items`, `tasks`, and `approvals` stay null. `fill` then keeps the loading copy (`server/mcp/apps/householdCard.ts:181`: “Loading the briefing…” when `state.items` is null). The speech line (`server/mcp/apps/householdCard.html:58`) is not a live region. `#note` is `role="status"` (`server/mcp/apps/householdCard.html:118`). A failed `connect()` does set empty lists and a clear sentence (`server/mcp/apps/householdCard.ts:288-292`).
- Why it matters: A host that cannot call the tools shows a loading list plus a quiet error. Design.
- Fix: On failure, set the three lists to `[]` and put the error in `#speech` as well as `#note`.
- Effort: S
- Confidence: high

### UX-14 Small type, the dev-token badge, and motion that reduced-motion does not stop
- Severity: P2
- Area: voice page chrome
- Evidence: The mode pill is `status.mode` at `src/alexa/AlexaSimulator.tsx:415-417`. Live text included “dev-token”. `document.title` is set to “AGORA+ voice” (`src/alexa/AlexaSimulator.tsx:172`), without “simulated” or “unofficial”. Caption lines use `transition-opacity duration-200` (`src/alexa/AlexaSimulator.tsx:426-428`). `motion-reduce:transition-none` is on the parent, not those lines. The ring does stop: `src/alexa/StatusRing.tsx:30-32`. The opening beat wants three citations on screen (`docs/DEMO_SCRIPT.md:14-18`); the page only links Spyglass (`src/alexa/AlexaSimulator.tsx:525-527`).
- Why it matters: A design judge’s first glance includes a debug badge and 10px labels. Someone who records the page as-is cannot show the Wired and Consumer Reports lines. Design.
- Fix: Say “development token” in a full sentence, or hide the pill when filming. Put “unofficial” in the document title. Add `motion-reduce:transition-none` on the caption lines. Put the other two citations on a title card, since they are not in the app.
- Effort: S
- Confidence: high

## Demo script

- **0:00 Hook.** Say the three complaints. Only the Spyglass “15 s” line is on `/alexa` (UX-14). The unofficial label is on screen (see What is good).
- **0:12 Remember.** The fast path and the receipt are real (`docs/images/alexa-sim-desktop.png` shows a verified remember and “fast path · no model”). The ack will not stay on the device caption (UX-6). Read the trace if you need “Got it, saving that.” Do not treat the meter’s first number as audio (UX-5).
- **0:35 Plan, yes, office.** Without Bedrock the card is not an empty list: `server/household/actions.ts:418-420` still says the team starts only after approval. Exact “yes” approves (`server/alexaSim/fastPath.ts:11`). Do not ad-lib “yes, but…” (UX-4). The cut to `/` shows Creative Studio, not Keeper (UX-3). No lights, locks, or routines are on these screens.
- **1:30 Briefing and Household.** “What’s my briefing?” currently says “Nothing urgent at home.” even with the allergy saved (UX-1). The panel will list the fact, and on this server it lists it three times (UX-12). The Household control is a 24px house icon (UX-11).
- **1:50 Claude, then Inspector.** This is outside the web UI. Do not click the voice-page chip “What is Mia allergic to?” unless Bedrock is on (UX-2). Inspector was not opened here.
- **2:20 How it is built.** `docs/ARCHITECTURE.md:5-32` is a mermaid block. An editor will show the source, not a picture, unless the recorder renders it. Unverified in a preview.
- **2:40 Close.** “One brain, every surface” is not a line in the app. It needs a title card. The office or the receipt can stay up.

## What is good (keep)

- The required label is the page `h1`: “AGORA+ voice · simulated Alexa+ experience (unofficial)” (`src/alexa/AlexaSimulator.tsx:400`). It stayed visible wrapped on `docs/images/alexa-sim-mobile.png`. The mark in `alexa-addon/media/icon.svg` and `public/media/icon-180.png` is a butter ring on ink, not an Alexa smile. Fonts are Schibsted Grotesk (`src/index.css:2`). This matches the project rule in `docs/plan/phase-4.md:8-9`. The Devpost trademark page was not fetched.
- Butter on the dark device clears AA by a wide margin: `#f2cc46` on `#17150f` is 11.73:1, and ink on butter is the same. The approval label on the tinted card is about 7.97:1.
- The text box has a real label (`src/alexa/AlexaSimulator.tsx:486-492`). Approve, Decline, Send, and Hold to talk are buttons. Hold to talk measured 106×44. Space talks when focus is not in a field (`src/alexa/AlexaSimulator.tsx:332-339`).
- Empty copy is real: live page showed “No spoken turn yet.” and “Speech recognition needs a Chromium browser. Type below.” when `SpeechRecognition` was missing. The Household panel has “Nothing saved yet.”, “No tasks yet.”, and “Nothing is waiting.” (`src/interface/HouseholdPanel.tsx:220-251`). The card distinguishes loading and empty (`server/mcp/apps/householdCard.ts:181-206`) and uses 48px buttons (`server/mcp/apps/householdCard.html:75-80`).
- The ring animation is turned off under `prefers-reduced-motion` (`src/alexa/StatusRing.tsx:30-32`). Viewports in `index.html:5`, `public/privacy.html:4`, and the card do not set `maximum-scale`.
- “yesterday” is not approved by the fast path, and exact “yes” / “no” are (UX-4). A new typed turn does call `stop()` so two answers do not stack (`src/alexa/AlexaSimulator.tsx:205`).

## Could not check

- Obscura MCP and `obscura fetch` block `127.0.0.1` unless `--allow-private-network` is set. The CLI with that flag loaded `/alexa`, `/`, and `/privacy.html`. Chrome’s debugger at `127.0.0.1:9222` answered `Runtime.evaluate` with “No page”, so the text box was not driven in a browser session. The briefing utterance was sent to `POST /api/alexa-sim/turn`, which is what the text box posts.
- Mic permission denied, Firefox, and Safari were not run. Barge-in was not heard. 320px width and 200% zoom were not resized; the mobile screenshot shows the stacked layout only.
- A plan was not approved, and Household rows were not edited. Bedrock step text and Polly audio were not measured. The office was not watched during a run.
