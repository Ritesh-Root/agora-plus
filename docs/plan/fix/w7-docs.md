# Your task: W7 docs and pitch (second wave)
Agent id: `w7-docs`. The five first-wave branches are merged into this tree. A QA agent is changing code and tests in parallel;
you edit ONLY documentation: `README.md`, `docs/*.md` (not `docs/council/**` or `docs/plan/fix/**`), `skills/agora-household/**`,
`alexa-addon/README.md`, and your notes file `docs/plan/notes/w7-docs.md`. Never invent measurements, quotes, URLs or results.

Read: `docs/council/COUNCIL_REPORT.md` (action 2 is yours), every file in `docs/plan/notes/`, `git log --oneline pre-window..HEAD`,
and the code for anything you describe (verify each claim against the code, not against the notes).

1. Make the pitch match what actually runs (JDG-3, VOC-1, VOC-6, VOC-7, CMP-1, CMP-4, CMP-5, SPEC-8):
   lead with what competitors do not claim: household memory is a file on a server you run, every write returns a receipt
   whose `verified` flag is a read-back, and nothing with side effects starts until a person says yes, enforced in code.
   Say the judged surfaces are the unofficial `/alexa` simulator and the MCP server used from Claude Code. ChatGPT and a live
   Alexa+ add-on were not run; say "MCP clients such as Alexa+ add-ons, Claude and ChatGPT can connect" only as capability.
   Bedrock and Polly run only with AWS credentials; keep `TODO(measure)` where numbers are missing.
   Latency: cite both dated facts (Spyglass Sep 2025 "up to 15 s"; The Verge Oct 2026 "3-5 s for simple commands") and frame
   AGORA+'s number as time to first audio on the fast path. Name the MCP versions honestly: we negotiate 2025-11-25 and newer;
   Alexa's client sends 2025-03-26; the current spec is 2026-07-28 (see `docs/council/reports/g4-spec-followup.md`).
2. Describe the new behaviour accurately: people on facts and tasks (`who`), the shopping list, reminders with `dueAt`, the
   briefing's memory line, recall that says both matches, refusing orders/bookings, the approval rules (model cannot approve;
   exact yes/no or a button; retry after a failure), the lock-down (loopback without a passcode, dev-token rules, redirect
   allowlist, limiter), persisted OAuth refresh, MCP Apps card on results, the Household cast in the office.
3. Update: `README.md` (quick start opens `/alexa` first; env table; "What changed Aug 31 - Oct 23" from a fresh
   `git diff --stat pre-window..HEAD`), `docs/ARCHITECTURE.md`, `docs/AWS.md`, `docs/DEPLOY.md` (new env vars, passcode
   required for `0.0.0.0`, `AGORA_OAUTH_REDIRECT_URIS`), `docs/SUBMISSION.md` (honest claims, a "Demo video" heading with a
   `<VIDEO_URL>` placeholder, delete the stale "working tree" sentence, Open Source answer: window contribution is the household
   MCP work, code MIT, `public/models/` CC BY-NC and not needed for `/alexa`), `docs/DEMO_SCRIPT.md` (open on `/alexa`;
   paraphrase the complaints in our own words with sources in the README instead of article sentences on screen; new beats:
   who + allergy, shopping list, briefing that mentions the allergy, plan + yes, office with Agora/Scout/Planner/Keeper and the
   summary line, Claude Code recall; still under 2:55), `docs/FEEDBACK.md` if anything changed,
   `skills/agora-household/SKILL.md` + `references/TOOLS.md` + `references/ALEXA_ADDON.md` (new tool args, approval rule,
   redirect allowlist, account linking).
4. Fold every notes file's changes into a dated entry in `docs/HACKATHON_CHANGES.md` and its friction items into
   `docs/FRICTION_LOG.md` (same columns as the existing rows).
5. Run `npm test` (the docs link test and the skill test must pass). Do not run the build or e2e.
