# Competitor gap analyst report
Summary: The line "a step ahead of Alexa" will look naive to a judge. Alexa+ already sells family memory, calendars, Voice ID reminders, grocery lists, cooking timers, a Brief speaking style, routines, and device control, and Gemini for Home (25 Jun 2026) assigns chores to named people. AGORA+ is ahead on a narrower claim the product pages do not make: a household file on a server you run, a receipt whose `verified` flag is a second read, and a named team that waits before a plan starts. Device control stays an accepted gap. ChatGPT voice mode, a 2026 Alexa latency number, and whether Gemini's June tips are on every Nest were not confirmed. This pass made 26 Cloudflare fetches, one over the 25-page cap, so the June tips page could be included.

## Feature matrix

Cells are has, partial, or missing. "Unverified" means the pages fetched did not say. AGORA+ cells are from this repo, not the README pitch. Device control is listed because the brief asked for it; it is an accepted out-of-scope gap, not a new finding.

| Capability | Alexa+ | Gemini for Home | ChatGPT | Claude | Siri / Apple Intelligence | Home Assistant Assist | AGORA+ |
|---|---|---|---|---|---|---|---|
| Shared memory you can edit | partial. Ask it to remember family facts. No editor on the pages fetched. | unverified | has, personal, not a shared house file | listed as Memory on the product page; editor not opened | partial. Personal context, not a shared house file | missing on the Assist and MCP pages fetched | partial. One household file, editable in the panel and as `agora://memory`. No person on the row |
| Multi-user / voice profiles | has. Voice ID, Visual ID, child profiles | partial. Named chore lists. Voice Match not on the tips page | partial. Linked teen accounts and parental controls | unverified | partial. Pick a Siri voice. No family profile on this page | partial. Admin vs non-admin on MCP, not a voice profile | missing. `source` is voice, mcp, ui, or agent |
| Shared lists and tasks | has. Shopping and grocery lists | has. Keep lists, grocery lists, family chore lists | unverified | partial. Google Calendar and other connectors, not a house list | partial. Reminders suggestions in Messages | partial. Google Tasks can be exposed as a tool | partial. One task list, optional due string, no owner |
| Calendar | has. Connected calendars, weekly widget, conflict flags on the new tablets | has. Read, move, and add events | unverified | has, via the Google Calendar connector | partial. Suggested "add a calendar event" | unverified | missing |
| Reminders and timers | has. Visual ID reminders and per-step cooking timers | has. Recurring reminders and a spoken timer in the same command as a device | unverified | unverified | partial. Add to Reminders | unverified | partial. A due string, spoken only when someone asks for the briefing. No timer |
| Proactive briefings or notifications | has. Daily Briefings and a For You widget | partial. You ask "what's on my calendar". No push briefing on this page | unverified | unverified | unverified | partial. Docs link a daily-summary tutorial; that page was not opened | partial. `daily_briefing` runs when called. Nothing sends it |
| Approvals before actions | unverified | unverified | unverified | has. Claude asks before tool calls in the Home Assistant setup | unverified | partial. The client asks; Home Assistant itself does not describe a household approval queue | partial. Only `forget` and `plan_and_run`. The panel can delete a fact with no queue |
| Receipts or proof of action | unverified | unverified | partial. Memory answers can show Sources | unverified | partial. Private Cloud Compute says data is never stored; that is not an action receipt | partial. A live context snapshot resource | has. `{ action, id, verified, at }` after a follow-up read |
| Multi-agent planning | unverified on the Oct 2026 feature page | unverified | unverified | unverified. Marketplace plugins mention agents; not a household team | missing on the page fetched | missing. One Assist API | has in code. Agora, Scout, Planner, Keeper. A live Bedrock run was not measured here |
| Web research with citations | partial. Named news partners. Link-level citations not quoted | partial. Answers questions. Citations not quoted | partial. Memory Sources, not web citations, on the help page | unverified | unverified | unverified | partial. Source titles can be appended to speech. URLs are stripped. The MCP result drops the source list |
| Privacy / self-hosting | missing for self-host. Tablet page: screen sight is opt-in | missing for self-host | missing. Cloud memory. Training opt-out exists | missing for self-host | partial. Private Cloud Compute, still Apple's servers | has. Assist can run on your hardware | partial. Facts and tasks are files on the server you run. Plans call Bedrock when that path is on |
| Works from several assistants | missing. Alexa is the assistant. MCP add-ons are a developer surface; that doc was not re-fetched | missing | has for remote MCP, per Home Assistant's ChatGPT example | has. Custom connector, Claude Code, 922 marketplace connectors | missing | has. Claude, ChatGPT, Claude Code, Codex, Cursor | partial. One MCP server. The demo client is Claude Code plus the simulator. The Alexa+ manifest still says `https://<host>/mcp` |
| Device control | has | has. Lights, vacuum, and music in one command | missing, unless a connector does it | missing on its own; can call Home Assistant | unverified on the Intelligence page. HomePod is only in the shop nav | has | missing. Accepted out of scope |
| Latency | unverified for Oct 2026 | unverified | unverified. chatgpt.com did not load | unverified | unverified | unverified | partial. Local fast path only. Model and Polly are `TODO(measure)` |

## Findings

### CMP-1 "A step ahead of Alexa" describes a product Alexa already advertises
- Severity: P1
- Area: `README.md` tagline, `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`
- Evidence: `README.md:3` "a household brain one step ahead of Alexa". Amazon's living feature page, fetched 2026-10-08, says it "will be updated periodically" and has no byline date: "Ask Alexa to remember things about you or your family" and "when you see Dan, remind him it's his turn to walk the dog" (https://www.aboutamazon.com/news/devices/new-alexa-top-features). The same page lists grocery lists, per-step cooking timers, and calendar widgets. The 8 Oct 2026 tablet announcement says a game schedule can be added to the calendar and conflicts flagged (https://www.aboutamazon.com/news/devices/new-amazon-alexa-tablets-alexa-plus).
- Why it matters: A judge scoring Impact and Quality of idea will hear a household loop Alexa already prints on its own feature page. The demo then shows memory, a briefing, and a meal plan, which is the part of that page Alexa claims too.
- Fix: Rewrite the tagline, the Devpost description, and the first 15 seconds around the three things those pages do not claim: the file is on your server, `verified` is a second read, and a plan does not start until yes. Leave calendars, timers, and lights out of the "ahead" sentence.
- Effort: S
- Confidence: high

### CMP-2 No person on a fact or a task, while Alexa and Gemini already name family members
- Severity: P1
- Area: `server/household/memoryStore.ts`, `server/household/taskStore.ts`
- Evidence: `server/household/memoryStore.ts:6` stores `text`, `tags`, and `source`, and `source` is only `'voice' | 'mcp' | 'ui' | 'agent'` (`memoryStore.ts:4`). `server/household/taskStore.ts:8` is `title`, optional `due`, and `status`. Gemini for Home, 25 Jun 2026: "add 'feed the dog' to Leo's chore list" (https://blog.google/products-and-platforms/devices/google-nest/gemini-home-voice-assistant-tips/). Alexa, same feature page as CMP-1: "Setup personalized Routines" for "any member of your family" and Visual ID reminders.
- Why it matters: The hero is a family brain (Impact, Design). Two people telling this server "remember" write into one pile. Recall cannot answer "what did Dad say" as Dad.
- Fix: Add an optional `who` string on `remember` and `add_task`, show it in the Household panel, and let `recall` and `daily_briefing` prefer that name. Do not build voice identification.
- Effort: S
- Confidence: high

### CMP-3 No calendar, no firing reminder, and no timer
- Severity: P1
- Area: `server/household/taskStore.ts`, `server/household/briefing.ts`, `server/alexaSim/fastPath.ts`
- Evidence: A task due date is an optional string (`taskStore.ts:10`). The briefing is "Fixed briefing. No model call." and only mentions a due day when something calls it (`briefing.ts:32`). `fastPath.ts` routes remember, briefing, tasks, and yes/no. It has no timer phrase. Alexa feature page: "Set smart cooking timers" and a calendar widget "with new weekly and monthly views". Gemini, 25 Jun 2026: "set a 20-minute timer for the chicken, start the vacuum cleaner, and play some relaxing music" and "What's on my calendar for the week?"
- Why it matters: Meal planning without a date on a calendar, and "what's my briefing?" only after someone asks, is the gap a household judge notices first (Impact, Design). Device control is accepted and should stay unbuilt.
- Fix: One `timers.json` row `{ id, label, fireAt }` plus a simulator card that shows it counting down. Keep calendar sync out. Say in the video that push notifications and Google Calendar are not in this build.
- Effort: M
- Confidence: high

### CMP-4 "Alexa+, Claude and ChatGPT" is already how Home Assistant documents its MCP server, and two of our three clients are not shown working
- Severity: P1
- Area: `alexa-addon/addon.json`, `docs/DEMO_SCRIPT.md`, `docs/SUBMISSION.md`
- Evidence: Home Assistant's MCP page, stamped 2026.10.0 (released 7 Oct 2026 on the site banner): "ChatGPT supports connecting to remote Model Context Protocol servers for Plus, Pro, Business, and Enterprise/Edu users" and the Claude section says "Claude will ask you for permission before calling any tools" (https://www.home-assistant.io/integrations/mcp_server/). `alexa-addon/addon.json:54` is still `"uri": "https://<host>/mcp"`. `docs/DEMO_SCRIPT.md:90` "The Inspector was not opened during the build." The scripted second client is Claude Code with `AGORA_MCP_TOKEN`.
- Why it matters: Technical implementation and Impact. "One brain, every surface" is a real MCP server plus a simulator. Saying Alexa+ and ChatGPT already call it, while the manifest host is a placeholder and ChatGPT is not in the demo, invites a judge who has read Home Assistant's docs to treat the claim as unfinished.
- Fix: In the video and Devpost, say the proof is Claude Code against this server, the add-on is a manifest, and ChatGPT is the same remote-MCP shape Home Assistant already documents. Filling `https://<host>` and recording one ChatGPT tool call is the only way to keep the wider sentence.
- Effort: S for the wording. L for a public host plus a live Alexa+ or ChatGPT call.
- Confidence: high

### CMP-5 Editable memory is already a ChatGPT setting. The part worth selling is that ours is a file on your machine, and forget waits
- Severity: P1
- Area: `src/interface/HouseholdPanel.tsx`, `README.md` pitch order
- Evidence: OpenAI Help, fetched 2026-10-08, "Updated: 19 days ago": "You can also edit the memory summary or a saved memory when those controls are available" (https://help.openai.com/en/articles/8590148-memory-in-chatgpt). AGORA+ does the edit in the panel (`HouseholdPanel.tsx:140` PATCH, `:154` DELETE) and returns `verified` from a follow-up read (`server/household/actions.ts:46`). No competitor page fetched describes a `verified` flag. Keeper's job is to flag a memory conflict (`server/household/team.ts:16`).
- Why it matters: Quality of idea. Leading with "it remembers" repeats ChatGPT and Alexa. The receipt, the on-disk file, and Keeper's allergy check are the lines those pages do not have, and they are currently behind the "step ahead" sentence.
- Fix: Move the receipt card and the Household panel edit into the first minute. Say "on this server" and "forget waits" in the same breath. Keep the peanut line as Keeper's check, not as proof of memory in general.
- Effort: S
- Confidence: high

### CMP-6 Alexa already sells a short speaking style, so a two-sentence cap is not the differentiator
- Severity: P2
- Area: `server/household/speech.ts`, `docs/research/feature-matrix.md` rank 8
- Evidence: `speech.ts:32` "at most a couple of sentences" with default `maxSentences` 2 (`speech.ts:33`). Alexa feature page: "Choose from new Alexa+ voices and personality styles—Brief, Chill, Sweet, and Sassy".
- Why it matters: Design. "Alexa is chatty, we cap at two sentences" is easy for a judge to answer with "Alexa has a Brief style."
- Fix: One spoken line in the demo: Brief is a cloud style you pick; this server always cuts the spoken line and leaves the list on screen. Do not spend build time on personalities.
- Effort: S
- Confidence: high

### CMP-7 Web research citations are titles inside the spoken line, and the tool result drops the links
- Severity: P2
- Area: `server/mcp/server.ts` `web_research`, `server/household/actions.ts`, `server/household/speech.ts`
- Evidence: `citeSources` appends "Source:" plus up to two titles (`actions.ts:353`). `speech.ts:21` strips `https?://` URLs before anything is spoken. The MCP handler returns only `speech` and `status` (`server.ts:502`). `docs/research/feature-matrix.md:8` says the screen shows the sources. Alexa, same feature page, "partnered with world-class news outlets including the Associated Press, Reuters".
- Why it matters: Technical implementation. The matrix promise is citations. A judge who asks "plan dinners, and where did the price come from?" hears a title, if the model named one, and cannot open the page.
- Fix: Put `{ title, url }[]` on `web_research` structured content and render those links on the receipt card. Keep URLs out of the spoken line.
- Effort: S
- Confidence: high

### CMP-8 "Asks before acting" is two tools, and Claude already asks before any tool call
- Severity: P2
- Area: `README.md`, `server/household/approvals.ts`, `docs/ARCHITECTURE.md`
- Evidence: `README.md:25` "Side effects from MCP wait." `approvals.ts:3` kinds are only `'forget' | 'start_run'`. `docs/ARCHITECTURE.md:109` the Household panel can delete memory over HTTP without that queue. Home Assistant's Claude instructions: "Claude will ask you for permission before calling any tools" (https://www.home-assistant.io/integrations/mcp_server/, page version 2026.10.0).
- Why it matters: Quality of idea. A blanket "asks before acting" is both wider than the code and similar to a permission prompt Claude already shows. The useful detail is which two actions wait, and that the panel does not.
- Fix: Say "forget and starting a plan wait; remembering and adding a task do not." If the demo edits memory in the panel, say that path is the editor, not the approval queue.
- Effort: S
- Confidence: high

## What is good (keep)

- The receipt is a second read, not a model claim. `server/household/actions.ts:46` returns `{ action, id, verified, at }`, and `actions.ts:119` sets `verified` only when the saved text matches.
- Keeper is a real role, not a slide. `server/household/team.ts:14` "Checks every plan against household memory (allergies, preferences, routines) and flags conflicts explicitly."
- Household facts are files on the server you run (`server/household/memoryStore.ts:15` `memory.json`), exposed as `agora://memory` (`server/mcp/server.ts:524`). ChatGPT's editable memory stays in OpenAI's account.
- The MCP surface is specific: twelve tools, and `plan_and_run` returns `needs_approval` without starting the team (`server/mcp/server.ts:337`).
- The README already refuses the device-control claim (`README.md:138` "No device control"). Keep that sentence. Do not let the tagline walk it back.
- Alexa+ on 8 Oct 2026 is a tablet, calendar, and screen feature (`new-amazon-alexa-tablets-alexa-plus`). AGORA+ should not answer that launch. It should answer the file, the receipt, and the wait.

## Scrape log (web members only)

| URL | Tool | Result | Date on the page |
|---|---|---|---|
| https://www.bing.com/search?q=Alexa%2B+features+household+memory+routines+October+2026&tbs=qdr%3Am | get_url_markdown | failed, 429 | none |
| https://www.bing.com/search?q=Google+Gemini+for+Home+features+2026&tbs=qdr%3Am | get_url_markdown | ok, Japan-localized, not the query | none useful |
| https://hn.algolia.com/api/v1/search_by_date?query=Alexa%20Plus&tags=story&numericFilters=created_at_i%3E1785542400&hitsPerPage=15 | get_url_json | failed, 400, prompt required | none |
| https://www.bing.com/search?q=Alexa+Plus+features+memory+routines&cc=us&setlang=en&mkt=en-US | get_url_markdown | ok, results were dictionary pages for "scarcely" | page footer © 2026 Microsoft |
| https://hn.algolia.com/api/v1/search_by_date?query=Alexa%20Plus&tags=story&numericFilters=created_at_i%3E1785542400&hitsPerPage=12 | get_url_markdown | ok, query matched the name Alex | newest useful hit 2026-10-08 |
| https://old.reddit.com/r/alexa/top/?t=month | get_url_markdown | failed, login wall | none |
| https://www.aboutamazon.com/news/devices/new-amazon-alexa-tablets-alexa-plus | get_url_markdown | ok | ships 14 Oct 2026; HN `created_at` 2026-10-08; no byline date in the body |
| https://hn.algolia.com/api/v1/search_by_date?query=%22Alexa%2B%22&tags=story&numericFilters=created_at_i%3E1751328000&hitsPerPage=20 | get_url_markdown | ok | hits from 2025-10-01 through 2026-10-08 |
| https://www.aboutamazon.com/news/devices | get_url_links | ok | fetched 2026-10-08 |
| https://www.aboutamazon.com/what-we-do/devices-services/alexa-plus | get_url_markdown | ok, hub of stories | fetched 2026-10-08 |
| https://alexa.amazon.com/about | get_url_markdown | failed, CloudFront 403 | none |
| https://hn.algolia.com/api/v1/search_by_date?query=%22Gemini%20for%20Home%22&tags=story&numericFilters=created_at_i%3E1751328000&hitsPerPage=15 | get_url_markdown | ok | newest hit 2025-11-01, background |
| https://www.aboutamazon.com/news/devices/new-alexa-top-features | get_url_markdown | ok | "updated periodically"; no byline date |
| https://blog.google/products/google-nest/gemini-for-home/ | get_url_markdown | ok | 20 Aug 2025, background |
| https://www.home-assistant.io/voice_control/ | get_url_markdown | ok | site banner 2026.10.0, 7 Oct 2026 |
| https://www.home-assistant.io/integrations/mcp_server/ | get_url_markdown | ok | same 2026.10.0 banner; integration introduced 2025.2 |
| https://hn.algolia.com/api/v1/search_by_date?query=%22Apple%20Intelligence%22&tags=story&numericFilters=created_at_i%3E1785542400&hitsPerPage=12 | get_url_markdown | ok | 21 Sep 2026 through 7 Oct 2026, mostly disk-space complaints |
| https://openai.com/news/ | get_url_links | ok | fetched 2026-10-08 |
| https://help.openai.com/en/articles/8590148-memory-in-chatgpt | get_url_markdown | ok | "Updated: 19 days ago" on 2026-10-08 |
| https://www.anthropic.com/news | get_url_links | ok | fetched 2026-10-08 |
| https://www.apple.com/apple-intelligence/ | get_url_markdown | ok | no article date; page says iOS 27 and "Siri AI is rolling out in English" |
| https://claude.com/connectors | get_url_markdown | ok | footer © 2026; "Show all 922" |
| https://chatgpt.com/ | get_url_markdown | failed, "Unable to load site" | none |
| https://blog.google/products-and-platforms/devices/google-nest/ | get_url_links | ok | related dates on the next page |
| https://blog.google/products-and-platforms/devices/google-nest/gemini-home-voice-assistant-tips/ | get_url_markdown | ok | 25 Jun 2026 |
| https://claude.com/product/overview | get_url_markdown | ok | "Claude Cowork is now just Claude"; no post date; footer year 2026 |
