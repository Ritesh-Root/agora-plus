# Your task: Council chair (no prefix; you merge everyone's work)
Write your report to `docs/council/COUNCIL_REPORT.md`. Read files and read-only git only. Do not run npm commands.

Read every report in `docs/council/reports/`. Then:
1. Check the evidence of every P0 and P1 finding against the actual file and line (or say the web evidence was not re-checkable).
   Reject findings whose evidence is wrong, and list them with the reason in a "Rejected" section.
2. Merge duplicates across members (keep all original IDs on the merged item). Where members disagree, say so and decide.
3. Write, in this order:
   - Verdict: 5 sentences max. Is AGORA+ ready to submit? What is the single biggest risk?
   - Scorecard: the judge member's 1-10 scores, adjusted if the code reviews change your view, with one line why.
   - Top 10 actions before 2026-10-23, ordered by (impact on judging) / (effort). For each: what, why, the finding IDs, effort,
     and the files it touches. Mark which ones need the user (credentials, recording, accounts) versus code only.
   - Gaps (product and market), merged from the VOC, competitor and judge members.
   - Code quality, merged from security, architecture, tests and UX: a short paragraph per area plus the merged findings table
     (ID, severity, title, area, effort, confidence, verified by chair yes/no).
   - Rejected findings and disagreements.
   - Members that failed or could not scrape, and what that means for confidence.
Keep it under 400 lines. Plain, direct English.
