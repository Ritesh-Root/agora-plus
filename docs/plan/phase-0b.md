# Phase 0b: Customer research with Firecrawl (research only — no code changes)

Goal: ground the product in real customer evidence. Why are people leaving Alexa / Alexa+ for ChatGPT and Claude,
and what do they want from an agentic assistant? Only write files under `docs/research/`. Do not touch code,
`package.json`, `docs/FRICTION_LOG.md`, `docs/HACKATHON_CHANGES.md` or anything else (another phase is editing those
right now). Skip the lint/test gate for this phase. If Firecrawl gave you trouble, write the friction notes to
`docs/research/firecrawl-friction.md` in the friction-log format from the shared rules.

Use the **Firecrawl MCP tools** (search, scrape, and extract if available) to collect evidence from:
- Reddit: r/alexa, r/amazonecho, r/ChatGPT, r/ClaudeAI, r/smarthome, r/homeassistant (try old.reddit.com if blocked).
  Search for: "Alexa+ worse", "Alexa plus slow", "switched from Alexa to ChatGPT", "Alexa+ forgets", "Alexa+ routines broken",
  "replaced Echo with ChatGPT voice", "Alexa+ review".
- App Store / Google Play reviews of the Alexa app (recent, 2026).
- Reviews: Consumer Reports, The Verge, Wired, CNET, Tom's Guide, TechRadar, Spyglass, Hacker News threads on Alexa+.
- Amazon's own Alexa+ announcements (to state fairly what Alexa+ claims).
- Surveys / reports on what people want from AI agents and assistants in 2025–2026: memory, proactivity, trust/control,
  privacy, verified actions, latency.

Write three files:

1. `docs/research/alexa-plus-voice-of-customer.md`
   - Executive summary (5 bullets).
   - Themes ranked by how often they appear. For each theme: a count of distinct sources, 2–4 short quotes
     (each under 25 words, in quotation marks) with source link and date, and a one-line "what this means for AGORA+".
   - A section "What people want from an agentic assistant" with the same structure.
   - A section "Latency and reliability claims we can cite" (exact numbers with sources).
   - A section "What Alexa+ does well" (be fair; judges are Amazon people).
   - No long excerpts. Paraphrase. Mark anything you could not confirm as "unverified".

2. `docs/research/feature-matrix.md` — one table, at least 8 rows, ranked:
   `| Rank | Pain point / need | Evidence (n sources) | AGORA+ feature | MCP tool / resource | Demo moment | Priority (P0/P1/P2) |`
   Map to the features and tool names in `docs/plan/ROADMAP.md` (remember, recall, forget, add_task, list_tasks,
   complete_task, daily_briefing, plan_and_run, get_run_status, approve_action, web_research, ask_agora,
   agora://memory, receipts, approvals, latency meter, instant acknowledgement). If evidence points to a need the
   roadmap misses, add it as a row with priority P1 or P2 and say so in a "Gaps vs roadmap" section below the table.

3. `docs/research/sources.json` — array of `{ "title", "url", "published", "accessed": "2026-10-08", "type" }`.

Acceptance: at least 25 distinct cited URLs in sources.json, every quote under 25 words with a link, at least 8 matrix rows.
