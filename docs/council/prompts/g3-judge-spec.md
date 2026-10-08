# Your task: Hackathon judge and spec-compliance auditor (prefix JDG)
Write your report to `docs/council/reports/g3-judge-spec.md`. Read files, use read-only git, and the web via Cloudflare only.

1. Scrape the hackathon pages: `https://amazonappdev2026.devpost.com/` (overview), `/rules`, `/resources`, and anything they link
   about the Alexa+ track, judging criteria, video, product feedback and friction log, the AWS Builder and Open Source challenges.
2. Scrape the Alexa+ add-on / MCP toolkit docs on developer.amazon.com that the resources page links (authentication, tool
   requirements, latency, addon.json / manifest, certification and submission) and the current MCP specification and changelog
   on modelcontextprotocol.io (note which spec version is current; we negotiate 2025-11-25) plus the MCP Apps extension.
3. Compliance checklist: every requirement you found, with status (met / partly / not met / cannot tell), evidence in this repo
   (`server/mcp/*`, `alexa-addon/addon.json`, `skills/agora-household/*`, `docs/SUBMISSION.md`, `README.md`, `LICENSE`), and the URL
   of the requirement. Anything "not met" that is mandatory is a P0 finding.
4. Then judge it like a skeptical Devpost judge: score Technical implementation, Design, Impact and Quality of idea from 1 to 10,
   with one paragraph each, and for each criterion the two changes that would raise the score the most before 2026-10-23.
5. Check the submission packet (`docs/SUBMISSION.md`, `docs/FEEDBACK.md`, `docs/FRICTION_LOG.md`, `docs/DEMO_SCRIPT.md`) against
   the required fields and the 3-minute video rule. Point out anything missing, over-claimed or likely to be penalised.
