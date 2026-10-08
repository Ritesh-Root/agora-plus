# Council chair report

Summary: AGORA+ is not ready to submit. The single biggest risk is the packet: there is no public video, the repo and Open Source fields are still placeholders, and the description says Alexa+, ChatGPT, Bedrock, and Polly are already in use. The household MCP server, the labeled voice page, and the approval tools are real, and a judge can run the fast path with no AWS credentials. On the scripted take, "What's my briefing?" still says "Nothing urgent at home" after the peanut fact is saved, and the office cut still shows Creative Studio. Fix the story and those two beats before 23 Oct 2026.

## Verdict

AGORA+ is not ready to file. The entry fails the submission requirements until a public YouTube or Vimeo video exists and the repo URL, contribution URL, and GitHub username are real. The biggest risk if someone pastes `docs/SUBMISSION.md` as it stands is that judges hear a 2025 "15 second Alexa" lead and a claim that three assistants and two AWS services were demonstrated, then watch a briefing that ignores the saved allergy and an office that is still a creative agency. The MCP server, PKCE, the skill, and the fast path are solid enough to carry a three-minute simulator demo. Spend the remaining days on the packet, the two broken beats, and the approval gate. Leave lights, calendars, and file splits alone.

## Scorecard

Judge scores on 8 Oct 2026, with no video and no public URL, were Technical 7, Design 6, Impact 6, Quality of idea 8. Adjusted after the code checks:

| Criterion | Judge | Chair | Why |
|---|---|---|---|
| Technical implementation | 7 | 6 | The server, the 2025-11-25 client test, and PKCE are real. The same model can call `approve_action`, a failed yes cannot be retried, refresh state dies with the process, and the Alexa card URI is on the tool definition only. |
| Design | 6 | 5 | The unofficial label and butter-on-ink device are in good shape. The 1:30 briefing ignores saved memory, the 0:35 office cut is Creative Studio, and the allergy sentence never reaches that screen. |
| Impact | 6 | 6 | Unchanged. A self-hosted file with a receipt is a credible product for people who already run a server. There is no public URL, and this week's reviews (not re-fetched here) say simple home commands got faster. |
| Quality of idea | 8 | 7 | The file, the yes, and the receipt match the creative examples the judge cited. The tagline sells a step ahead of a product that already advertises family memory, and the packet says ChatGPT and Alexa+ already call this server. |

Stage 1 should still pass once the video shows `/alexa` and `/mcp`. The resources page allows a web simulator. That page was fetched by the judge, not by the chair.

## What is good (keep)

- PKCE is S256 only, codes are single-use, and client secrets use `timingSafeEqual` (`server/mcp/oauth.ts:340`, `516-518`, `247-251`).
- `forget` and `plan_and_run` return `needs_approval` and do not delete or start the team (`server/mcp/server.ts:208-213`, `346-355`). The skill says not to approve on the person's behalf (`skills/agora-household/SKILL.md:73-75`).
- The voice page labels itself "simulated Alexa+ experience (unofficial)" (`src/alexa/AlexaSimulator.tsx:400`). Fast-path remember is tested (`server/alexaSim/bridge.test.ts:125`).
- A receipt is a second read (`server/household/actions.ts:46`, `119`). Household files are `memory.json` on the server you run (`server/household/memoryStore.ts:15`).
- The submission already refuses lights (`docs/SUBMISSION.md:25`) and already says no live Bedrock or Polly call was recorded (`docs/SUBMISSION.md:83`).
- `legacy: 'stateless'` is the right switch for Alexa's `initialize` and a newer client on one URL (`server/mcp/http.ts:33-35`).

## Top 10 actions before 2026-10-23

Ordered by impact on judging divided by effort.

### 1. Record the video and publish the repo

- What: Record the script in Chrome, stop before 2:55, upload a public English YouTube or Vimeo video, and put that URL on the Devpost form and in `docs/SUBMISSION.md`. Publish the public MIT repo, or invite the listed Devpost reviewers, and fill the three Open Source fields. Delete the sentence that says the write-up is still uncommitted (`docs/SUBMISSION.md:73`). HEAD is `23f39e9` and that file is already in the commit.
- Why: Judges can score from the video alone, and they cannot clone a placeholder. This is the submission blocker.
- IDs: JDG-1, JDG-2
- Effort: M for the video, S for the URLs
- Files: `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`, `README.md`, the Devpost form
- Who: the user (recording, YouTube or Vimeo, GitHub). No code change makes a video exist.

### 2. Make the written pitch match what was actually run

- What: Lead with three things the competitor pages do not claim: the file is on your server, `verified` is a second read, and a plan does not start until yes. Say the judged surfaces are the unofficial simulator and Claude Code with `AGORA_MCP_TOKEN`. Say Bedrock and Polly run only when AWS credentials are present. Say the add-on manifest is still a template. Open the video and the README on `/alexa`. Paraphrase the three complaints. Keep the CC BY-NC models out of a video Amazon might feature. On the meter, cite both the Sep 2025 "up to 15 s" line and the 8 Oct 2026 "three to five seconds" line, with dates. One sentence on Google: Claude can already see devices elsewhere; this server keeps household facts and the yes.
- Why: A judge who read this morning's review, or who tests the claim "ChatGPT calls that server too," will mark the idea down. The code does not do what the first paragraphs say.
- IDs: JDG-3, JDG-5, JDG-6, JDG-8, VOC-1, VOC-6, VOC-7, CMP-1, CMP-4, CMP-5, SPEC-8
- Effort: S
- Files: `README.md`, `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`, `docs/ARCHITECTURE.md`, `src/alexa/AlexaSimulator.tsx` (the Spyglass line at 526)
- Who: docs and one UI string are code-only. The user speaks the new lines in the recording.

### 3. Make the briefing mention a saved fact

- What: Add one spoken sentence from saved memory (the allergy, when one is stored) before "Nothing urgent at home." Assert those words in a test that saves "Mia is allergic to peanuts" first.
- Why: This is the 1:30 beat. The page will sound like it forgot the fact the pitch is about. `docs/DEMO_SCRIPT.md:64` already asks for that sentence. `buildBriefing` never puts memory into `speechParts` (`server/household/briefing.ts:65-73`). Memory is used only as a suggestion when the list is empty (line 81).
- IDs: TST-1, UX-1
- Effort: S
- Files: `server/household/briefing.ts`, `server/mcp/mcp.test.ts`
- Who: code only

### 4. Make "What is Mia allergic to?" hit memory

- What: Route that phrase through `recall` on the fast path and speak the saved fact. Until that ships, remove the chip.
- Why: The chip sits on the voice page for the whole demo (`src/alexa/AlexaSimulator.tsx:13`). `routeFast('what is Mia allergic to?', …)` is null (`server/alexaSim/fastPath.test.ts:112`). With no model, the bridge says the thinking model is not connected.
- IDs: UX-2
- Effort: S
- Files: `server/alexaSim/fastPath.ts`, `src/alexa/AlexaSimulator.tsx`
- Who: code only

### 5. Make the latency meter and the caption tell the truth

- What: Record "first speech" only from audio `onStart`. Keep the acknowledgement on the device until that audio ends, then show the answer.
- Why: The script tells the recorder to read the meter and to show the acknowledgement (`docs/DEMO_SCRIPT.md:7`, `28-29`). `rememberSample` runs when `final` arrives, before `speak(data.text)`, and falls back to `ackAt` (`src/alexa/AlexaSimulator.tsx:209-212`, `294-295`). `spokenLine` is `latest.spoken` (line 379), which the final event replaces (line 289).
- IDs: UX-5, UX-6
- Effort: S
- Files: `src/alexa/AlexaSimulator.tsx`, `src/alexa/LatencyMeter.tsx`, `src/alexa/useSpeechOutput.ts`
- Who: code only

### 6. Put the allergy sentence on the screen the demo cuts to

- What: Add `spokenSummary` to the `society-complete` payload and render that one line. On `/alexa`, when a household run finishes, speak the latest `get_run_status`. In the same change, ship a household roster whose names match `HOUSEHOLD_TEAM`, or change the script so the cut opens the Society panel and does not call Creative Director "Keeper."
- Why: `society-complete` sends tasks and synthesis, not `spokenSummary` (`server/runEngine.ts:406-419`). Nothing under `src/` reads `spokenSummary`. The office loads `DEFAULT_AGENTIC_SET_ID = 'single-agent'`, which is not a set id, so `getAgentSet` falls through to Creative Studio (`src/data/agents.ts:26`, `86-98`, `488-492`). A household role name maps to `agents[0]` when it does not match (`src/network/NetworkClient.ts:39-43`).
- IDs: TST-3, UX-3
- Effort: M
- Files: `server/runEngine.ts`, `src/data/agents.ts`, `src/network/NetworkClient.ts`, the Society panel, `docs/DEMO_SCRIPT.md`
- Who: code only, then the user records the cut

### 7. Make "yes" mean a person, and make a failed yes retryable

- What: Do not give `approve_action` to `runToolLoop`. Call it from the fast path on an exact yes or no, and from the buttons. Use that same whole-phrase check for the acknowledgement. When the plan preview throws, keep the waiting card and do not call `planSociety` again after the yes. Leave the approval `pending` until the handler succeeds. Pass a short timeout into the Bedrock client for the preview. On the Household panel, make Delete ask for a confirm. The script wants the panel to prove the file is editable (`docs/DEMO_SCRIPT.md:67-69`); a confirm keeps that beat and stops a one-click loss of the hero fact.
- Why: The voice loop passes every tool name to `callTool` (`server/alexaSim/bridge.ts:332-336`) and the system prompt tells the model to call `approve_action` (`server/alexaSim/conversation.ts:11`). The ack treats any word "yes" as going ahead (`server/alexaSim/ack.ts:27-38`); the fast path approves only the whole phrase (`server/alexaSim/fastPath.ts:11`). A failed preview stores no `presetTasks` (`server/household/actions.ts:413-424`); `asTasks` then returns undefined and `runSociety` plans again (`server/society/Orchestrator.ts:392-395`). `docs/ARCHITECTURE.md:84` says there is no second planning call. The success path is the one that is tested. `resolveApproval` sets `approved` before `await handler` (`server/household/approvals.ts:77-85`). Panel Delete calls `deleteMemory`, whose comment is "UI delete. Does not ask for approval." (`server/household/actions.ts:154-156`, `src/interface/HouseholdPanel.tsx:153-156`).
- IDs: SEC-2, UX-4, ARC-1, ARC-2, ARC-3, TST-2, TST-6, VOC-3, SEC-11
- Effort: M
- Files: `server/alexaSim/bridge.ts`, `server/alexaSim/conversation.ts`, `server/alexaSim/ack.ts`, `server/mcp/server.ts`, `server/household/actions.ts`, `server/household/approvals.ts`, `server/llm/bedrockProvider.ts`, `src/interface/HouseholdPanel.tsx`
- Who: code only

### 8. Lock the household before any judge URL is public

- What: When `AGORA_HOUSEHOLD_PASSCODE` is empty, bind `127.0.0.1` and refuse `/api/*` writes. Ignore `AGORA_MCP_TOKEN` when `AGORA_PUBLIC_URL` is set or `NODE_ENV=production`, and reject a token secret or dev token shorter than 32 bytes. Exact-match `redirect_uri` against an env list. Accept the OAuth client secret in HTTP Basic or the form body. Share one guess limiter across `/oauth/authorize` and `/api/session`.
- Why: `householdLockEnabled` is only "a passcode is set" (`server/household/session.ts:23-25`). `refuseLocked` returns false when the lock is off (`server/routes.ts:103-104`), so `DELETE /api/memory/:id` runs (`server/routes.ts:348-350`). `server/prod.ts:54` and `package.json:15` listen on `0.0.0.0`. The dev token gets every scope and skips the audience check (`server/mcp/oauth.ts:654-660`, `server/mcp/http.ts:197`). `allowedRedirect` returns true for any `https:` URL (`server/mcp/oauth.ts:313-314`). The token handler rejects the request before reading the body unless the Authorization header is Basic (`server/mcp/oauth.ts:484`, `247-251`). A wrong OAuth passcode only redisplays the form (`server/mcp/oauth.ts:627-629`).
- IDs: SEC-1, JDG-9, SEC-3, SEC-4, SEC-5, SEC-7, JDG-7, SPEC-1, SPEC-5
- Effort: S
- Files: `server/household/session.ts`, `server/routes.ts`, `server/prod.ts`, `package.json` or `vite.config.ts`, `server/mcp/oauth.ts`, `server/alexaSim/oauthClient.ts`, `README.md`, `.env.example`
- Who: the code can land without the user. A public testing URL needs the user to choose the passcode, `AGORA_TOKEN_SECRET`, and the redirect list, and to keep that host up through 20 Nov 2026.

### 9. Put the household card where a 2026 host and Alexa look for it

- What: On `daily_briefing` and `list_tasks` results, set `_meta.ui.resourceUri` to the card URI, and advertise `io.modelcontextprotocol/ui` on the server. Add `accountLinking.enabled` only when a real HTTPS origin replaces every `<host>`. Omit `web_research` from `tools/list` unless a key is set. Do this if the video or the Alexa track credit depends on the card or a deploy. The simulator path does not need a deploy.
- Why: `result()` returns `content` and `structuredContent` only (`server/mcp/server.ts:74-78`). The card URI is on the tool definition (`server/mcp/server.ts:116`, `316`). `McpServer` is constructed with a name and instructions (`server/mcp/server.ts:126-128`). `alexa-addon/addon.json` has `https://<host>/mcp` (line 54) and no `accountLinking` key. `ask_agora` allows 9 seconds (`server/household/actions.ts:208`). Whether Alexa applies a 500 ms cap to every tool was not re-checked here; the member who fetched the quickstart marked that part medium.
- IDs: SPEC-2, SPEC-3, SPEC-4, SPEC-7, SPEC-9, JDG-4
- Effort: S for the metadata and the manifest flag. M if `ask_agora` must return in under 500 ms. L if the user deploys a real add-on.
- Files: `server/mcp/server.ts`, `alexa-addon/addon.json`, `server/household/actions.ts`, `skills/agora-household/references/ALEXA_ADDON.md`
- Who: metadata is code-only. Replacing `<host>` and running `alexa-ai deploy` is the user.

### 10. Name the person on a fact, and refuse an order you cannot place

- What: Add an optional `who` on `remember` and `add_task`. If recall finds two hits, say both. If the goal is an order, a reservation, or a booking, `plan_and_run` should say it cannot place it and return no `approvalId`. Accept "shopping list" on the fast path.
- Why: The fresh complaint, from the voice-of-customer pass, is a confident wrong family fact and a 20-minute lunch order. `recallAnswer` speaks `I remember this: ${best.text}` for `memories[0]` (`server/household/actions.ts:310-312`). Memory has no person field (`server/household/memoryStore.ts:6-13`). Every goal gets "I can plan that, but I will wait for your yes" (`server/mcp/server.ts:346-355`). The fast path is `to my list`, so "shopping list" does not match (`server/alexaSim/fastPath.ts:17`).
- IDs: VOC-2, CMP-2, VOC-4, VOC-5
- Effort: S
- Files: `server/household/memoryStore.ts`, `server/household/taskStore.ts`, `server/household/actions.ts`, `server/mcp/server.ts`, `server/alexaSim/fastPath.ts`, `src/interface/HouseholdPanel.tsx`
- Who: code only. The demo line "Jen's school, Mia's allergy" is the user, in the recording.

Not in the ten, and worth doing if the ten are done: one bridge test for plan, then yes, then a single run (TST-4); persist refresh records under `AGORA_DATA_DIR` (ARC-4, SPEC-6); upgrade Vite past 6.4.1 and `ws` past 8.20.0 before `npm run dev` on a shared network (SEC-8, SEC-6). Do not build a calendar or a timer this week (CMP-3). Say in the video that push notifications and Google Calendar are absent.

## Gaps (product and market)

The product can answer family memory, a yes, and a receipt before 23 Oct. It does not answer them yet. Recall will state one keyword hit as fact. The Household panel deletes with one click. `plan_and_run` will offer to plan an order it cannot place. Tasks have a title and an optional due string, and no owner (`server/household/taskStore.ts:8-10`). There is no calendar, no firing reminder, and no timer. The briefing speaks only when someone asks. Shared lists are one list, and the fast path misses "shopping list."

The market moved under the pitch. The voice-of-customer member's 8 Oct 2026 Verge review, which the chair did not re-fetch, says Alexa+ is that reviewer's best smart-home assistant, that weather and timers come back in a few seconds, and that the remaining failures are family memory, identity, and errands that eat 20 minutes. The US App Store feed that member opened had 31 of 50 newest reviews at 1 star, dated 5–6 Oct 2026, many of them about lists. One reviewer said they are turning to ChatGPT. That is the whole scale that pass can support. Do not cite a mass switch.

Competitors already print the broad claim. Alexa's feature page, fetched by the competitor member and not re-fetched here, says it remembers family facts, grocery lists, cooking timers, and calendar widgets. Gemini for Home, 25 Jun 2026, assigns chores to named people. ChatGPT's help page says memory can be edited in the account. Home Assistant's MCP page, stamped 2026.10.0, already documents ChatGPT remote MCP and says Claude asks before tool calls. Google, via the TechRepublic page in the voice-of-customer pass, already lets Claude see authorized home devices. Device control stays an accepted gap. The lines those pages do not have are the on-disk file, the `verified` read-back, and a named team that waits. Two-sentence speech is a weak differentiator: Alexa already sells a Brief style (CMP-6, P2).

What a stranger still cannot do: open a public URL (`README.md` has none in the quick start), share one house across processes, or keep files when the task disk is replaced. The manifest is US-only (`alexa-addon/addon.json:4`). ChatGPT is not in the demo. The Inspector was not opened during the build (`docs/DEMO_SCRIPT.md:90`).

## Code quality

### Security

The OAuth core is in good shape: S256, single-use codes, HMAC expiry, and refresh scope pinned to the original grant. The household is a different story. With no passcode, every interface that can reach the port can read memory and delete it, and both the dev server and `server/prod.ts` bind `0.0.0.0`. The development bearer is accepted in that same process, with every scope, no expiry, and no minimum length. The voice simulator falls back to it when OAuth is configured and nobody has linked (`server/alexaSim/oauthClient.ts:152-153`). The "ask before acting" gate is a prompt the same model can satisfy. The CORS proxy, the model test, and `/__relay` sit in front of the household lock (`server/prod.ts:35`, `server/relay.ts:52-54`, `187-195`). With no `DEMO_HOST_SECRET`, the first caller is host (`server/roomState.ts:124-126`, `server/hub.ts:25`). Installed versions match the members' notes: Vite `6.4.1`, `ws` `8.20.0`. The chair did not re-run `npm audit` and did not re-fetch the advisories.

### Architecture

Household writes go through `server/household/actions.ts`. The twelve tools share one `speech` plus `status` envelope. The voice page does not keep that contract for forget: `parseTool` copies `preview` and drops `summary` (`server/alexaSim/bridge.ts:123`), and forget sets `summary` only. A throw on the plan preview is planned again after the yes, which contradicts `docs/ARCHITECTURE.md:84`. `resolveApproval` marks the row approved before the work finishes, so a busy room (`server/runEngine.ts:287-288`) or a thrown handler spends the id. OAuth refresh records and the simulator link are `Map`s (`server/mcp/oauth.ts:52-53`, `server/alexaSim/oauthClient.ts:36`). Access tokens are stateless HMAC and survive a restart; an hour later the refresh lookup returns `invalid_grant`. Approvals are the same kind of map (`server/household/approvals.ts:21`). Leave `oauth.ts`, `server/mcp/server.ts`, `AlexaSimulator.tsx`, `actions.ts`, and `runEngine.ts` unsplit until after the deadline.

### Tests

The reliability member ran `npm test` three times (155 passed) and both typechecks, and the chair did not re-run them. The files match the coverage claim. `server/alexaSim/bridge.test.ts` has three cases (lines 86, 125, 147) and none of them send the plan utterance or "yes." `daily_briefing` is checked with `typeof speech === 'string'` (`server/mcp/mcp.test.ts:232-236`). `spokenSummary` is asserted in the JSON file (`server/household/actions.test.ts:144`) and is absent from `src/`. `server/llm/bedrockProvider.ts:109` constructs the client with no timeout. The SDK comment at `node_modules/@anthropic-ai/bedrock-sdk/mantle-client.js:77` says the default is 10 minutes, and `node_modules/@anthropic-ai/sdk/client.js:912` sets `DEFAULT_TIMEOUT = 600000`. `publicModelError` has no 429 branch and falls through to "The model could not answer just now." (`server/modelError.ts:29-42`). A green unit run is not a rehearsal of the take.

### UX

Butter `#f2cc46` on ink `#17150f` is the pair in `src/index.css:11-15`. The chair did not recompute the contrast ratios. The failing pairs the UX member named are in the source: the privacy kicker is `#d9af1b` on `#efebe0` (`public/privacy.html:14`, `29`), panel meta text is `text-zinc-400` (`src/interface/HouseholdPanel.tsx:188`), Delete is `text-red-400` (line 216), and the talk button's focus ring is `outline-paper` (`src/alexa/AlexaSimulator.tsx:475`) on the cream page. Header Household and Voice are 16px icons with `title` set and no `aria-label` (`src/interface/Header.tsx:237-254`). The approval card has no role and nothing moves focus to Approve (`src/alexa/AlexaSimulator.tsx:431-453`). Microphone errors set listening to false and do not read `event.error` (`src/alexa/useSpeechInput.ts:41-43`). Starting to listen does not call `stop()` (`src/alexa/AlexaSimulator.tsx:205` is inside `submit`). The UX member's live POST and the three duplicate peanut rows were not re-run here. The code path that produces "Nothing urgent at home" was.

### Merged findings

P0 and P1. "Verified" means the chair read the cited file and the quote matches. Web quotes were not re-fetched.

| IDs | Sev | Title | Area | Effort | Confidence | Verified |
|---|---|---|---|---|---|---|
| JDG-1 | P0 | No public demo video | `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md` | M | high | yes (no video URL in the file). Rules page not re-fetched |
| JDG-2 | P0 | Repo and Open Source fields are placeholders | `docs/SUBMISSION.md:55`, `87-91`; `README.md:53` | S | high | yes. Branch `alexa-hackathon` has no upstream. HEAD `23f39e9` |
| SEC-1, JDG-9 | P0 | Household API is open on every interface when no passcode is set | `server/routes.ts`, `server/prod.ts` | S | high | yes. Chair keeps P0. See disagreements |
| TST-1, UX-1 | P1 | Briefing does not mention saved facts | `server/household/briefing.ts` | S | high | code yes. Live POST not re-run |
| TST-3, UX-3 | P1 | Office cut is Creative Studio, and the allergy line never reaches it | `src/data/agents.ts`, `server/runEngine.ts` | M | high | yes |
| UX-2 | P1 | The allergy chip does not use memory | `src/alexa/AlexaSimulator.tsx`, `fastPath.ts` | S | high | yes |
| JDG-3, VOC-1, VOC-6, VOC-7, CMP-1, CMP-4, CMP-5 | P1 | Pitch over-claims Alexa+, ChatGPT, Bedrock, and "a step ahead" | `docs/SUBMISSION.md`, `README.md`, `docs/DEMO_SCRIPT.md` | S | high | code and docs yes. Review pages not re-fetched |
| SEC-2, UX-4 | P1 | The model can approve itself, and a qualified yes is spoken as approval | `server/alexaSim/bridge.ts`, `ack.ts` | M | high | yes |
| ARC-3, TST-2 | P1 | A failed preview is planned again, and Bedrock can sit for minutes | `actions.ts`, `bedrockProvider.ts` | M | high | yes. 10-minute default is in the installed SDK |
| ARC-2, TST-6 | P1 | An approval is marked approved before the work finishes | `server/household/approvals.ts` | S | high | yes. Chair keeps P1 |
| ARC-1 | P1 | Voice approval drops the forget summary | `server/alexaSim/bridge.ts` | S | high | yes |
| VOC-3, SEC-11 | P1 | The panel deletes a memory with no yes | `HouseholdPanel.tsx`, `actions.ts` | S | high | yes. Chair keeps P1 |
| ARC-4, SPEC-6, TST-5 | P1 | Refresh, the simulator link, and a waiting yes die with the process | `server/mcp/oauth.ts`, `approvals.ts` | M | high | yes |
| SEC-5, JDG-7, SPEC-1 | P1 | Any https URL is accepted as the OAuth redirect | `server/mcp/oauth.ts` | S | high | code yes. Spec and Alexa pages not re-fetched |
| SPEC-5 | P1 | Token endpoint requires HTTP Basic before it reads the body | `server/mcp/oauth.ts:484` | S | medium | code yes. Which Amazon sample the live client sends was not run |
| SPEC-2 | P1 | Alexa card URI is on the tool definition, not the tool result | `server/mcp/server.ts` | S | high on the omission | code yes. Alexa lifecycle page not re-fetched |
| SPEC-3 | P1 | Server never advertises the MCP Apps extension | `server/mcp/server.ts:126-128` | S | high | code yes. Extensions page not re-fetched |
| SPEC-4, JDG-4 | P1 | Add-on manifest is still a template, and account linking is off | `alexa-addon/addon.json` | S | high | yes |
| SPEC-7 | P1 | `ask_agora` may run 9 seconds against a 500 ms quickstart line | `actions.ts:208` | M | medium | code yes. 500 ms page not re-fetched |
| SEC-3 | P1 | Dev token is a full MCP credential with no minimum length | `server/mcp/oauth.ts`, `oauthClient.ts` | S | high | yes. The token's existence is accepted. The production fallback is the finding |
| SEC-4 | P1 | Passcode guesses are unlimited, and the consent page can be framed | `oauth.ts`, `session.ts` | S | high | yes |
| SEC-6 | P1 | Passcode does not cover the proxy, the model test, or the room socket | `server/relay.ts`, `server/prod.ts` | M | high on the missing auth; medium on the `ws` advisory | code yes. Advisory page not re-fetched. `ws` 8.20.0 confirmed |
| SEC-7 | P1 | Token signing key can be a single character | `server/mcp/oauth.ts:68-73` | S | high | yes |
| SEC-8 | P1 | Vite 6.4.1 is in the member's dev-server file-read range | `package.json` dev script | S | medium | version and `--host=0.0.0.0` yes. Advisory not re-fetched |
| VOC-2, CMP-2 | P1 | No person on a fact or a task | `memoryStore.ts`, `taskStore.ts` | S | high | code yes. Competitor quotes not re-fetched |
| VOC-4 | P1 | "Order lunch" is accepted as a plan | `plan_and_run` | S | high | code yes. Verge quote not re-fetched |
| VOC-5 | P1 | Fast path misses "shopping list" | `fastPath.ts:17` | S | high | code yes. App Store quotes not re-fetched |
| CMP-3 | P1 | No calendar, firing reminder, or timer | `taskStore.ts`, `briefing.ts` | M | high | code yes. Chair: say it in the video. Do not build it this week |
| UX-5 | P1 | "First speech" is often the ack text | `LatencyMeter.tsx`, `AlexaSimulator.tsx` | S | high | code yes |
| UX-6 | P1 | Caption drops the acknowledgement while it is still being said | `AlexaSimulator.tsx` | S | high | yes |
| UX-7 | P1 | Starting to talk does not stop Agora | `useSpeechInput.ts`, `AlexaSimulator.tsx` | S | high | yes |
| UX-8 | P1 | Approval is easy to miss from the keyboard | `AlexaSimulator.tsx`, `HouseholdPanel.tsx` | M | high | yes |
| UX-9 | P1 | Microphone errors are silent, and the hold button can stick | `useSpeechInput.ts` | S | high on the missing error; medium on the stuck pointer | code yes. Not reproduced on a device mic |
| UX-10 | P1 | Legal pages, panel meta text, and the talk-button focus ring fail contrast | `privacy.html`, `index.css`, `HouseholdPanel.tsx` | S | high | colors yes. Ratios not recomputed |
| UX-11 | P1 | Household and Voice are unlabeled icons | `Header.tsx:237-254` | S | high | yes. Live 24×24 box not re-measured. `size={16}` plus `p-1` is 24px of CSS |
| JDG-5 | P1 | Quick start opens the old 3D office | `README.md:80` | S | high | yes. Folded into action 2 |
| JDG-6 | P1 | Open Source text treats a mixed-license repo as one MIT project | `LICENSE`, `LICENSE-ASSETS.md:9` | S | high | yes. `git cat-file` of the pre-window license was not re-run |
| TST-4 | P1 | Plan-then-yes voice path is untested, and leaving the page drops it | `bridge.test.ts`, `bridge.ts:244-248` | M | high | yes. The three test names match |

P2, kept, not all re-read. Ones the chair happened to confirm are marked.

| IDs | Sev | Title | Effort | Verified |
|---|---|---|---|---|
| SEC-9 | P2 | Reused refresh token does not revoke the replacement | M | not re-read. The rotation block at `oauth.ts:548-566` matches the member's quote |
| SEC-10 | P2 | Audience follows Host unless `AGORA_PUBLIC_URL` is set | S | yes (`oauth.ts:94-103`) |
| SEC-12 | P2 | SSRF guard checks DNS, then fetches the name again | M | not re-read |
| ARC-5 | P2 | Environment names do not match what the server reads | S | `DEMO_HOST_SECRET` at `hub.ts:25` confirmed. The rest not re-read |
| ARC-6 | P2 | "Due today" uses the server clock | S | yes (`briefing.ts:16-19`) |
| ARC-7 | P2 | A list of finished tasks is spoken as zero open tasks | S | yes (`server.ts:265-270`) |
| ARC-8 | P2 | JSON files and the Polly voice are trusted without a schema | S | not re-read |
| TST-7 | P2 | A bad memory file throws; a failed run save is swallowed | S | not re-read |
| TST-8 | P2 | Household HTTP writes and three task tools are untested | M | routes and mcp tests not fully re-read. Bridge test count confirmed |
| TST-9 | P2 | A few tests wait on the wall clock; e2e never opens `/alexa` | S | not re-read. Member did not run e2e |
| UX-12 | P2 | Repeating "remember" stores the same fact again | S | `remember` always calls `addMemory` (`actions.ts:111-114`). Live triple row not re-run |
| UX-13 | P2 | Echo Show card stays on "Loading" when tools fail | S | not re-read |
| UX-14 | P2 | Dev-token badge, title omits "unofficial," reduced motion misses the caption | S | title is "AGORA+ voice" (`AlexaSimulator.tsx:172`). Mode pill not re-read |
| VOC-8 | P2 | No Stop while it is talking | S | `stop()` is inside `submit` (line 205). No Stop control in the section the chair read |
| CMP-6 | P2 | Two-sentence cap is not the differentiator | S | cap is in the pitch. Alexa Brief quote not re-fetched |
| CMP-7 | P2 | Web research citations drop the links | S | `web_research` returns speech and status (`server.ts:499-502`) |
| CMP-8 | P2 | "Asks before acting" is two tools | S | kinds are `forget` and `start_run` (`approvals.ts:3`). `ARCHITECTURE.md:109` already says the panel skips the queue |
| JDG-8 | P2 | Demo hook puts copyrighted review sentences on screen | S | yes (`DEMO_SCRIPT.md:16-18`). Rules page not re-fetched |
| SPEC-8 | P2 | README names one protocol version, and three are in play | S | `README.md:21` says 2025-11-25. SDK version lists not re-read. Spec index not re-fetched |
| SPEC-9 | P2 | `web_research` errors when no key is set | S | yes (`mcp.test.ts:227-230`, `server.ts:488-502`) |
| SPEC-10 | P2 | Store description says "MCP server" | S | yes (`addon.json:12`) |

## Rejected findings and disagreements

No P0 or P1 was rejected. Every code quote the chair opened matched the file. Web quotes were not re-checked, so they were not rejected either.

Corrected, and kept:

- JDG-7's impact line says anyone who knows the client id receives the authorization code. The redirect check is as wide as the finding says (`oauth.ts:313-314`). The code is sent only after the passcode (`oauth.ts:627-639`). Redeeming it still needs the client secret and the PKCE verifier (`oauth.ts:484`, `521-523`). SPEC-1 and SEC-5 describe that correctly. The hole is a phished consent plus a leaked secret, and a spec mismatch, not an unauthenticated token mint.
- `docs/ARCHITECTURE.md:84` says a yes starts the stored steps and there is no second planning call. That is true when the preview succeeded. The catch path omits `presetTasks` and `runSociety` plans again. The doc is wrong about the failure path. The code wins.

Disagreements, decided:

- Open household: SEC-1 calls it P0. JDG-9 calls the same behavior P2. Chair: P0 for any process on `0.0.0.0`, including `server/prod.ts` and the documented `npm run dev`. It does not replace the missing video as the form blocker if the recording stays on localhost and no judge URL is published. It blocks a public testing URL.
- Panel delete: SEC-11 and CMP-8 treat it as P2, and `docs/ARCHITECTURE.md:109` already admits it. VOC-3 calls it P1 because the demo opens that panel. Chair: P1. One confirm is enough. A full second approval queue would fight the script's "edit the file" beat.
- Spent approval: ARC-2 is P1, TST-6 is P2. Chair: P1. A Bedrock throw or a busy room spends the scripted yes.
- Person field: VOC-2 estimates half a day and wants the briefing grouped by person. CMP-2 estimates under an hour for an optional `who`. Chair: S for `who` plus "say both hits." Grouping the whole briefing can wait.
- Calendar and timer: CMP-3 is a real gap a household judge will notice. Chair: leave it out of the build. Say it in the video. Device control stays out of scope, as already accepted.

## Members that failed, and what that does to confidence

- Judge (g3) fetched the Devpost overview and rules, then got HTTP 429 on the MCP specification, the Amazon Alexa+ toolkit, and the MCP Apps API, and stopped. The resources page succeeded on a retry. Spec compliance in that report is "cannot tell" for the current spec version, Apps requirements, and certification. The spec follow-up (g4) later fetched those Amazon pages and the 2026-07-28 spec with no 429, so the council does have that evidence. The chair did not re-fetch it. Judge scores do not include SPEC-2, SPEC-3, SPEC-5, or SPEC-7. The Technical score was lowered partly because of those.
- Voice of customer (g1) could not read Reddit (login wall) or a useful Hacker News query (422, then a too-broad result). Bing often returned the wrong pages. The Verge review, PCMag, TechRepublic, Android Authority, and the US App Store feed succeeded. There is no counted exodus from Alexa to ChatGPT. Family-memory pain rests on that one Verge review plus the App Store lines.
- Competitors (g2) failed `chatgpt.com`, `alexa.amazon.com` (CloudFront 403), Reddit, and some Bing queries. ChatGPT voice mode and an October 2026 Alexa latency number are unverified in that matrix. The About Amazon feature page, the tablet announcement, the Gemini tips page, Home Assistant's MCP page, and the OpenAI memory article succeeded. One fetch was over that member's 25-page cap.
- UX (q4) could not drive the text box in the Chrome debugger ("No page"). The briefing utterance was a `POST /api/alexa-sim/turn`. Mic denial, Firefox, Safari, barge-in, and a live plan approval were not run.
- Security (q1) and reliability (q3) ran `npm audit` and `npm test`. The chair did not re-run either, because this task forbids npm. Their pass counts and advisory titles are unverified here. Installed Vite and `ws` versions were read from `node_modules`.
- No AWS credentials are on this machine. Bedrock and Polly latency stay `TODO(measure)`. That was already accepted.

Confidence is high on the code findings marked verified. Confidence is medium on every judging claim that depends on a page fetched by g1, g2, g3, or g4, because the chair did not open those URLs again. The pitch change in action 2 depends on that web pass. If those quotes are wrong, the code bugs in actions 3 through 8 still stand.
