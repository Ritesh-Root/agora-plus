# Your task: W3 brain (household memory, tasks, briefing, fast path, MCP spec)
Agent id: `w3-brain`. Read `docs/council/reports/g1-voice-of-customer.md` (VOC-2, VOC-5), `g2-competitors.md` (CMP-2, CMP-3,
CMP-7), `q3-reliability-tests.md` (TST-1, TST-7), `q4-frontend-ux.md` (UX-1, UX-2, UX-12), `q2-architecture.md` (ARC-6..8),
`g4-spec-followup.md` (SPEC-2, SPEC-3, SPEC-4, SPEC-9, SPEC-10).

1. Contract 1: add `who` to memory and `who`, `list`, `dueAt` to tasks, through the stores, the action layer, the MCP tool
   input/output schemas (`remember`, `recall`, `add_task`, `list_tasks`, `complete_task`), the resources and the REST payloads.
   Old files without these fields must still load.
2. VOC-2: infer `who` on remember when the fact starts with a capitalised name ("Mia is allergic to peanuts" -> who "Mia").
   Recall: when two or more memories match about equally, say both briefly instead of picking one; when asked about a person,
   prefer that person's facts. Never present a weak keyword match as certain ("I'm not sure, but I have: ...").
3. UX-12: remembering the same fact again (same text after normalising) updates the existing entry instead of adding a copy.
4. TST-1 / UX-1: `daily_briefing` speaks one sentence from saved memory when it exists, safety facts (allergies, medicine)
   first, e.g. "Remember: Mia is allergic to peanuts." Also mention reminders that are due. Keep the 2-sentence voice limit.
5. UX-2: the fast path answers questions about a person or a saved fact ("what is Mia allergic to?", "what do you know about
   Mia?", "what does Jen like?") from memory with no model call.
6. VOC-5: the fast path accepts "add milk to my shopping list" / "add milk to the shopping list" / "put eggs on the grocery list"
   (stored with `list: "shopping"`), and "what's on my shopping list?". Keep "add X to my list" working.
7. CMP-3 (small version): "remind me to call Grandma at 6pm", "remind me in 10 minutes to check the oven" create a task with
   `dueAt` (use `AGORA_TIMEZONE`, default the server's zone; ARC-6: "due today" also uses that zone). No calendar.
8. ARC-7: `list_tasks` with only finished tasks says there are no open tasks, not "0 open tasks. First is <done task>".
9. ARC-8 / TST-7: validate JSON files on read (memory, tasks): a corrupt or wrong-shape file is moved aside to
   `<name>.corrupt-<timestamp>.json`, logged once, and treated as empty, so the next write does not throw or silently erase it.
10. SPEC-2 / SPEC-3: put `_meta.ui.resourceUri` (the household card URI) on the `daily_briefing` and `list_tasks` tool
    RESULTS as well as the definitions, and declare the MCP Apps extension (`io.modelcontextprotocol/ui`) in the server's
    capabilities the way `@modelcontextprotocol/ext-apps` and the server SDK `.d.ts` files allow. Read the `.d.ts` first.
11. SPEC-9: only list `web_research` when a research key is configured. CMP-7: its structured result includes the source
    links (title + url); speech stays short.
12. SPEC-4 / SPEC-10: `alexa-addon/addon.json` gets an `accountLinking` block (enabled, authorization-code with PKCE, scopes
    `mcp:tools mcp:resources`, URLs under the same `<host>` placeholder) and consumer-language descriptions with no "MCP",
    "server", "API" or tool names. Keep the `<host>` placeholders; the user fills them at deploy time.
13. Tests for every item (stores, briefing, fastPath, mcp.test.ts tool schemas and results).
