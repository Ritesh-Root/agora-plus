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
