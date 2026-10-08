# What changed during the hackathon window (Aug 31 – Oct 23, 2026)

Before the window: baseline tag `pre-window` = commit `4f61371` (2026-08-20).

## Commits already in the window

```
4d95503 Let each agent use its own saved model connection.
431dab6 Give the office floor and furniture distinct colors.
8259238 Describe AGORA from the current source and drop hackathon branding.
1f49694 Add a temporary Cloud Run process for the shared demo room.
414a083 Show swarm steps in the activity log and drop unused scaffolding.
6983ddc Keep a swarm document inside the brief and one active run per room.
1478169 Show when the swarm is debating or assembling the document.
8411707 Let a local swarm finish a document with the selected team.
837b26f Keep character movement in step with the walk cycle.
0955d4d Show each Jev decision and let the boss approve, edit, or reject an ask.
b8f4b56 Research a task on the server only when Jev says it needs current information.
2e7a220 Play recorded society runs from the join screen without a relay or an API key.
cf83bd1 Render the office on WebGL2, with a flat canvas when the GPU is missing.
14aedf3 Checkpoint the society harness and Jev decider before the renderer work.
```

## Phase log

### 2026-10-08 — Phase 0a: Baseline

Made the typecheck pass without changing how the app runs. The Vite relay now passes the dev HTTP server through as a Node `http.Server`. Ending a session reads the failure reason only after the result is narrowed to the failure case, the same way joining a full room already does. The orchestrator's local model-result type now includes the reply text and optional token usage, so the call tally type-checks. `.agora-data/` is gitignored, the new server environment names are listed in `.env.example` with empty values, and this changelog plus the friction log now exist.

### 2026-10-08 — Phase 1: Household core and run engine

The server can now remember facts, keep a task list, and hold an action for approval, all in `.agora-data` (or `AGORA_DATA_DIR`). Every saved change comes back with a receipt that says whether a follow-up read saw the same record. Forgetting something, or starting a household swarm, always waits for a yes or no that expires after ten minutes. A person editing memory in the HTTP API does not need that approval.

Spoken text is shortened to about two sentences, with Markdown and bare links removed. A daily briefing is built from due tasks, open tasks, waiting approvals, and runs from the last day, without calling a model. The household team is Agora, Scout, Planner, and Keeper.

A swarm can start from the server, not only from a browser. The office still animates through the host's socket when someone is connected. Finished runs are saved as `runs/<id>.json` and a markdown file. `GET /api/household` returns memory, tasks, pending approvals, and recent runs. The same routes are mounted in the Vite dev server and the production process.
