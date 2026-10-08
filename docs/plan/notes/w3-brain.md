# W3 brain

## What changed

- `server/household/store.ts`: `loadJsonFile` reads memory and task JSON on the same queue as writes. A missing file is empty. Corrupt JSON or a rejected shape is renamed to `<name>.corrupt-<timestamp>.json`, logged once, and treated as empty so the next save does not erase the bad file.
- `server/household/clock.ts`: new. `AGORA_TIMEZONE` (else the server zone) for calendar days, "due today", "at 6pm", and "in 10 minutes". Times are ISO 8601 with a numeric offset.
- `server/household/memoryStore.ts`: optional `who`. A fact that starts with a capitalised name such as "Mia is allergic to peanuts" stores who "Mia" unless the caller passed a person. The same text after trim, collapsed space, and case folding updates the existing row. Recall ranks by content words, prefers a named person, says two facts when the scores tie, and says "I'm not sure, but I have: ..." when the overlap is only partial. Old rows with no `who` still load. The memory resource names the person when there is one.
- `server/household/taskStore.ts`: optional `who`, `list`, and `dueAt`. Old rows without them still load. A bad `tasks.json` is moved aside the same way as memory.
- `server/household/briefing.ts`: one spoken sentence from memory, allergies and medicine first ("Remember: Mia is allergic to peanuts."). A reminder whose `dueAt` is already past is spoken as "Reminder: <title>." "Due today" and overdue use `AGORA_TIMEZONE`. Speech stays at two sentences.
- `server/household/actions.ts`: `remember`, `recall`, `addTask`, and `listTasks` carry the new fields. "today" / "due today" becomes that zone's calendar day. `web_research` still returns source links; tests can swap the lookup so a key does not call the network. `forget`, `requestRun`, `planAndRun`, `askAgora`, and `recallAnswer` were left as they were.
- `server/alexaSim/fastPath.ts`: memory questions ("what is Mia allergic to?", "what do you know about Mia?", "what does Jen like?") route to `recall`. Shopping phrases store `list: "shopping"`. "what's on my shopping list?" lists that list. "add X to my list" is unchanged. Reminder phrases set `dueAt`. The APPROVE and REJECT sets were not edited.
- `server/mcp/server.ts`: `remember`, `recall`, `add_task`, `list_tasks`, and `complete_task` schemas and results include the new fields. `list_tasks` with only finished tasks says there are no open tasks and does not call a finished title the first task. `daily_briefing` and `list_tasks` results set `_meta.ui.resourceUri` plus short `invoking` and `invoked` strings, same card URI as the tool definitions. The server advertises `io.modelcontextprotocol/ui` with the app MIME type via `EXTENSION_ID` from `@modelcontextprotocol/ext-apps`. `web_research` is registered only when `FIRECRAWL_API_KEY` or `EXA_API_KEY` is set, and its structured result includes `{ title, url }`. Spoken research still has no URL. `ask_agora` still returns memories without `who`, because that output schema rejects extra properties.
- `alexa-addon/addon.json`: `accountLinking` is enabled, authorization code, PKCE `S256`, scopes `mcp:tools` and `mcp:resources`, authorize and token URLs under `https://<host>/...`. Store copy no longer says MCP, server, API, or tool names. `<host>` placeholders stay.

## Finding IDs

Closed in this tree: VOC-2 (who plus recall speech; the panel grouping is W4), VOC-5 (fast path and `list`; the panel block is W4), CMP-2 (fields on the records), CMP-3 (the small reminder only: `dueAt`, no calendar and no countdown card), CMP-7, TST-1, TST-7 for memory and tasks, UX-1 (spoken briefing), UX-2 (fast path; the chip label is W4), UX-12 (dedup), ARC-6, ARC-7, ARC-8 for memory and task files, SPEC-2, SPEC-3, SPEC-4 (linking block, placeholders kept), SPEC-9, SPEC-10.

Not this agent: TST-7's swallowed run save, ARC-8's Polly voice, the Household panel, and replacing `<host>` at deploy time.

## Contracts

- Contract 1: `MemoryEntry.who`, `HouseholdTask.who`, `list`, and `dueAt` on the stores, actions, MCP tools, `agora://memory`, `agora://tasks`, and the objects inside `GET /api/household`.
- Contract 5, storage side: an open task with `dueAt` in the past is treated as due in the briefing ("Reminder: <title>."). The 30s poll and the spoken reminder on the simulator are W4.

## Needs from others

- W2 `server/routes.ts`: `POST /api/memory` should pass optional `who` into `remember`. `POST /api/tasks` should pass optional `who`, `list`, and `dueAt` into `addTask`. A fact that starts with a name still gets `who` without that change. `GET /api/household` already returns the fields. `.env.example` should mention `AGORA_TIMEZONE` (this agent must not edit that file).
- W1 `ask_agora`: its output schema rejects additional properties, so `who` is omitted there. `recallAnswer` still speaks only the top memory. `executeAsk` does not forward `list` into `listTasks`. The voice fast path does not use those helpers.
- W4: show `who`, `list` (Shopping as its own block), and `dueAt`. Speak "Reminder: <title>." from the poll. The briefing `speech`, `items`, and `suggestions` already contain the "Remember:" line when memory is the news.

## Friction

- Task: put `who` on every memory object the tools return. Expected: `ask_agora` could grow an optional field. Actual: `@modelcontextprotocol/server` validates tool output with `additionalProperties: false`, and `ask_agora` is owned by W1, so an extra `who` failed the call. Workaround: `remember` and `recall` include `who`; `ask_agora` still returns `id`, `text`, and `tags` only.
- Task: account-linking block. Expected: a manifest the CLI accepts. Actual: the account-linking page describes `enabled` and the URLs, not a full JSON schema, and this agent must not run `alexa-ai`. Workaround: `enabled`, `type: AUTHORIZATION_CODE`, `pkce: S256`, the two scopes, and the `<host>` authorize and token URLs. A stricter schema may want different key names.

## Left undone

- No calendar, no timer file, no countdown card.
- REST create bodies do not accept the new fields until W2 updates the routes.
- `ask_agora` and its memory fallback do not use the new recall sentence.
