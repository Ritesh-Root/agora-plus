# Fix wave: shared rules (read first)

You are one of five Cursor agents fixing AGORA+ at the same time. Each agent works in its own git worktree on its own
branch, owns its own files, and Claude merges the branches afterwards. Your worktree path is your current workspace.
AGORA+ is a household brain for the Amazon Developer Hackathon (Alexa+ track, deadline 2026-10-23): React 19 + Vite 6,
a self-hosted MCP server at `/mcp` (OAuth for Alexa+), a voice simulator at `/alexa`, household memory/tasks/approvals on
disk, and a multi-agent team (Agora, Scout, Planner, Keeper) that plans after a human says yes.

Read first:
- `docs/council/COUNCIL_REPORT.md` (the merged audit and the top-10 actions).
- The member reports in `docs/council/reports/` that your task names (they have the exact file:line evidence).
- The code you are about to change. Match its style: comment density, naming, idiom. Small, surgical changes.

## Hard rules
- Only edit the files your task says you own. If a fix needs a change in a file you do not own, do not make it: write it
  under "Needs from others" in your notes file. Exception: new test files next to code you own, and new files you create.
- Do NOT edit `README.md`, `docs/*.md`, `skills/**`, `docs/HACKATHON_CHANGES.md` or `docs/FRICTION_LOG.md`. A docs agent
  updates them after the merge from your notes file.
- Do not touch `src/simulation/**` or the 3D assets in `public/`.
- Never create directories named `memory/` or `scripts/` (`.gitignore` ignores them).
- Never write secrets. Never create or edit `.env` or `.env.local`. Only the security agent edits `.env.example`.
- MCP: only `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/client`, `@modelcontextprotocol/ext-apps`.
  Never import `@modelcontextprotocol/sdk`. When unsure of an API, read its `.d.ts` files in `node_modules`.
- Server code must type-check under `server/tsconfig.json` (strict). Tests must not touch the network.
- Do NOT run `git commit`, `git push`, `git reset`, `git checkout`, `git stash`, `git rebase` or `git merge`. Claude commits.
- Do not start long-running servers and leave them running. Use a port other than 3000 and 3100 if you must start one.
- Keep public behaviour that other agents rely on (see Contracts). Do not rename exported functions other files import.

## Who owns what
| Agent | Owns |
|---|---|
| W1 trust | `server/alexaSim/bridge.ts`, `conversation.ts`, `ack.ts`, `sse.ts`, new `server/alexaSim/approvalWords.ts`, the `APPROVE`/`REJECT` lines in `server/alexaSim/fastPath.ts` only, `server/household/approvals.ts`, `server/llm/*`, `server/modelError.ts`; in `server/household/actions.ts` only `forget`, `requestRun`/`planAndRun`, `askAgora` and their helpers; in `server/mcp/server.ts` only the `forget`, `plan_and_run`, `approve_action`, `ask_agora`, `get_run_status` tools |
| W2 security | `server/household/session.ts`, `server/routes.ts`, `server/prod.ts`, `server/relay.ts`, `server/hub.ts`, `server/roomState.ts`, `server/modelTest.ts`, `server/proxyGuard.ts`, `server/mcp/oauth.ts`, `server/mcp/http.ts`, `server/alexaSim/oauthClient.ts`, `package.json`, `package-lock.json`, `vite.config.ts`, `.env.example` |
| W3 brain | `server/household/memoryStore.ts`, `taskStore.ts`, `briefing.ts`, `speech.ts`, `store.ts`, `server/research/*`; in `server/household/actions.ts` everything W1 does not own; in `server/mcp/server.ts` everything W1 does not own (other tools, resources, prompts, the `result()` helper, server construction); `server/alexaSim/fastPath.ts` except the `APPROVE`/`REJECT` lines; `alexa-addon/addon.json` |
| W4 voice UX | `src/alexa/*`, `src/interface/HouseholdPanel.tsx`, `src/interface/Header.tsx`, `src/index.css`, `src/main.tsx`, `src/types.ts` (household fields only), `public/privacy.html`, `public/terms.html`, `server/mcp/apps/*` |
| W5 office | `src/data/agents.ts`, `src/network/NetworkClient.ts`, `src/interface/SocietyPanel.tsx` and other society UI under `src/interface/` that W4 does not own, `shared/protocol.ts`, `server/runEngine.ts`, `server/household/team.ts`, `src/integration/store/*` |

## Contracts between agents (build to these even before the other side exists)
1. Household data (W3 adds, W4 renders when present, everyone else ignores):
   `MemoryEntry.who?: string` (the person the fact is about, e.g. "Mia").
   `HouseholdTask.who?: string` (owner), `HouseholdTask.list?: string` (e.g. "shopping"; absent = the main to-do list),
   `HouseholdTask.dueAt?: string` (ISO 8601 with offset; the existing free-text `due` stays).
   `GET /api/household` keeps its shape `{ memory, tasks, pendingApprovals, recentRuns, suggestions }` with these optional fields.
2. Runs (W5): a household run is written to `runs/<id>.json` with `status: 'running'` when it starts, and again when it ends.
   `recentRuns` in `GET /api/household` is newest first and includes `id`, `status`, `startedAt`, `spokenSummary?`.
   The `society-complete` WebSocket payload also carries `spokenSummary` when there is one.
3. Approvals (W1): the voice simulator never lets the model call `approve_action`. A person approves with an exact yes/no
   (fast path) or a button (`POST /api/approvals/:id`). `approve_action` stays an MCP tool for external clients.
   The bridge's SSE `final` event includes `runId` when that turn started a run.
4. Approval words (W1): `server/alexaSim/approvalWords.ts` exports `approvalDecision(utterance: string): 'approve' | 'reject' | null`
   (whole-phrase match only; "yes but not Tuesday" and "yesterday" are null). `ack.ts` and `fastPath.ts` both use it.
5. Reminders (W3 stores, W4 announces): an open task with `dueAt` in the past is "due". The simulator polls
   `GET /api/household` about every 30 s while open and speaks "Reminder: <title>." once per task per page load.
6. Run completion (W4): after an approval, the simulator watches `recentRuns` for a run that started after the approval and,
   when its status leaves `running`, speaks its `spokenSummary` once.

## Done means
- In your worktree: `npm run lint && npm run lint:server && npm test && npm run build` all pass. Add or update vitest tests
  for every behaviour you change (fake timers, no network).
- Write `docs/plan/notes/<your-agent-id>.md`: what you changed (file by file, plain words), which council finding IDs it
  closes, contracts you implemented, "Needs from others", friction worth logging (task, expected vs actual, workaround),
  and anything left undone. This is the only docs file you write.
- End your reply with: files changed, commands run and their results, finding IDs closed, anything left undone.

---
