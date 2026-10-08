# W5 office

## What changed

- `src/data/agents.ts`: Added a Household set. Agora leads, then Scout, Planner, and Keeper, with the same descriptions as `server/household/team.ts`. It is the default set. An unknown id, including the old `single-agent` id, resolves to Household. Creative Studio and the other sets stay selectable. A role name maps onto that character; other roles are spread across the set instead of all landing on the lead.
- `src/integration/store/teamStore.ts`: Saved team choice version 3. A stored `single-agent` id becomes Household. A real set id is left alone.
- `src/network/NetworkClient.ts`: Task logs and core-store assignments use the role name. `society-complete` logs the spoken summary (Keeper when it mentions an allergy or a conflict). A snapshot's `spokenSummary` is restored when the message has one.
- `src/integration/store/societyStore.ts`: A restored or finished run keeps `spokenSummary`. A save error on the completion payload marks the run `needs_revision` and fills the panel error.
- `src/interface/SocietyPanel.tsx`: When a spoken summary is present, the panel shows a highlighted line. The heading is "Keeper says" if the line mentions an allergy or a conflict, otherwise "Spoken summary".
- `shared/protocol.ts`: `society-complete` may include `spokenSummary` and `error`. `society-snapshot` may include `spokenSummary`.
- `server/runEngine.ts`: A household run writes `runs/<id>.json` with `status: 'running'`, the brief, `startedAt`, and tasks so far, and refreshes that file as tasks are noted. The file is updated again when the run ends, including `spokenSummary`. `listRecentRuns` is newest first by `startedAt`. A second household start while one is active returns "The team is still working on the last plan. Ask me for its status." A room start still returns "A run is already in progress." If the finished save fails, the run is kept as `needs_revision` (or the original non-complete status) with `error: "The finished plan could not be saved."`, in memory and on `society-complete`.
- `server/runEngine.test.ts`: Running file at the start, spoken busy error, room busy line unchanged, spoken summary on the payload, newest-first order, visible save failure.
- `src/data/agents.test.ts`: Default set is Household and matches the server team. Creative Studio still resolves. Role names map to those four characters.
- `vitest.config.ts`: Includes `src/data/**/*.test.ts` so the set test actually runs.

## Finding IDs closed

- UX-3: the office default is the household team, not Creative Studio.
- TST-3 (office half): `spokenSummary` is on `society-complete` and shown in the Society panel.
- TST-5 (run half): a household run is on disk while it is running, recent runs are newest first, and a second household start speaks the busy line.
- TST-7 (run half): a failed finished save stays on the run as `needs_revision` plus an `error`, and the office payload carries that error.

## Contracts

- Contract 2: household run file is written at start with `status: 'running'` and again at the end. `listRecentRuns` (what `GET /api/household` already returns as `recentRuns`) is newest first and includes `id`, `status`, `startedAt`, and `spokenSummary` when set. `society-complete` carries `spokenSummary` when there is one.

## Needs from others

- W2, `server/relay.ts` and `server/roomState.ts`: a join sends `society-snapshot` without `spokenSummary`. The protocol field and the client restore are in place. Copy the line onto the room run and the snapshot so someone who joins after the run still sees it.
- W2, `server/relay.ts`: a second office Execute still says "A run is already in progress." The household and MCP path speaks "The team is still working on the last plan. Ask me for its status."
- W4: speak `spokenSummary` on `/alexa` when a household run leaves `running`. The office payload now has the sentence. `recentRuns` does too.
- `src/simulation/SceneManager.ts` (not owned): during a run it walks characters by task order, not by role name. The names on screen come from the active set, which is now Household. Logs and task assignment follow the role.

## Friction

- Task: put the default-set test next to `src/data/agents.ts`. Expected: `npm test` would pick it up. Actual: `vitest.config.ts` only includes a few `src/` globs, so a test under `src/data/` never ran. Workaround: added that glob. The config is not on the ownership table.
- Task: check the office in the browser. Expected: Obscura could open the preview. Actual: Obscura refuses `127.0.0.1`. Workaround: Playwright against `vite preview` on port 3217. A stored `single-agent` choice migrated to Household, and the public room listed Agora, Scout, Planner, and Keeper. Creative Director was not the roster.

## Left undone

- If the process dies mid-run, `runs/<id>.json` can stay `status: 'running'`. A new run can still start. Asking for that old id can say the team is still going until something rewrites the file.
- The Society panel's Keeper line was not driven by a live model run in the browser. The payload and the panel markup are covered; the built page was checked for the roster only.
