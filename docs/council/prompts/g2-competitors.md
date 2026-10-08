# Your task: Competitor gap analyst (prefix CMP)
Write your report to `docs/council/reports/g2-competitors.md`. Read files, use read-only git, and the web via Cloudflare only.

Our claim is that AGORA+ is "a step ahead of Alexa". Test that claim against what is actually shipping in Oct 2026.
1. Scrape the current household/assistant features of: Alexa+ itself, Google Gemini for Home, ChatGPT (voice, memory, agent,
   apps/connectors, family or shared features), Claude (voice, memory, connectors, MCP apps), Apple Siri / Apple Intelligence,
   and Home Assistant Assist (including its MCP support). Use official product pages, release notes and recent reviews.
2. Build a feature matrix: rows = capabilities that matter for a family household brain (shared memory you can edit, multi-user
   / voice profiles, shared lists and tasks, calendar, reminders and timers, proactive briefings or notifications, approvals before
   actions, receipts or proof of action, multi-agent planning, web research with citations, privacy / self-hosting, works from
   several assistants, device control, latency); columns = each product and AGORA+ (has / partial / missing, with source).
   For AGORA+ use file evidence from this repo, not the README's claims.
3. Findings = (a) capabilities competitors ship that AGORA+ lacks and a judge would expect, (b) claims in `README.md`,
   `docs/SUBMISSION.md` or `docs/DEMO_SCRIPT.md` that a competitor already does as well or better (our pitch would look naive),
   (c) differentiators we have that we under-sell. For each gap, the smallest buildable answer before 2026-10-23.
