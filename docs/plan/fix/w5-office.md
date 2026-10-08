# Your task: W5 office (household team on screen, run lifecycle)
Agent id: `w5-office`. Read `docs/council/reports/q4-frontend-ux.md` (UX-3), `q3-reliability-tests.md` (TST-3, TST-5, TST-7),
`docs/DEMO_SCRIPT.md` (the office cut). Do not touch `src/simulation/**`; change the data and wiring that feed it.

1. UX-3: `DEFAULT_AGENTIC_SET_ID` points at a set that does not exist, so the office falls back to "Creative Studio". Add a
   "Household" agentic set whose roles match `server/household/team.ts` exactly (Agora the lead, Scout research, Planner
   logistics, Keeper checks plans against household memory), with short, plain instructions, and make it the default set.
   Keep the other sets selectable. Make sure a household run started from MCP or the simulator shows those four characters
   (check the role-name mapping in `src/network/NetworkClient.ts`, which currently maps unknown roles to `agents[0]`).
2. TST-3: put `spokenSummary` on the `society-complete` payload (`shared/protocol.ts`, `server/runEngine.ts`) and show it in
   the Society panel as a highlighted "Keeper says" / summary line when present, so the allergy sentence is visible on the
   office screen.
3. TST-5 / Contract 2: write `runs/<id>.json` with `status: 'running'` (brief, startedAt, tasks so far) when a household run
   starts, update it at the end; `listRecentRuns` returns newest first. A second run while one is active returns a clear
   spoken error ("The team is still working on the last plan. Ask me for its status.") instead of a bare failure.
4. TST-7 (run half): when saving a finished run fails, keep a visible error on the run (status `needs_revision` or an `error`
   field) instead of only logging.
5. Tests: run engine (running record written at start, newest-first order, busy error, summary on the payload) and a small
   test for the default agent set resolving to the Household set.
