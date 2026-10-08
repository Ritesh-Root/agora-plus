# Shared rules for every phase (read first)

You are working in `/home/ritesh/Documents/agora-plus-alexa-hackathon`, git branch `alexa-hackathon`.
This is AGORA: React 19 + Vite 6 + zustand + a three.js office, a WebSocket relay in `server/relay.ts`
(mounted into Vite by `relayPlugin()`), and the production server in `server/prod.ts`.
We are turning it into AGORA+, an agentic household brain for the Amazon Developer Hackathon (Alexa+ track).

Before you change anything:
- Read `docs/plan/ROADMAP.md` (the whole plan) and, if it exists, `docs/research/feature-matrix.md`.
- Read the existing code you are about to touch. Match its style: comment density, naming, idiom.

Hard rules:
- Reuse existing modules (`server/society/Orchestrator.ts`, `server/research/*`, `server/proxyGuard.ts`,
  `server/society/provider.ts`, `server/routingProvider.ts`, `server/roomState.ts`, the BossCard pattern).
  Do not rewrite working code. Make the smallest change that does the job.
- Do not touch `src/simulation/**` or the 3D assets in `public/`.
- Never create directories named `memory/` or `scripts/` (`.gitignore` ignores them).
- Never write secrets anywhere in the repo. Never edit or create `.env`, `.env.local` or any `.env.*` other than `.env.example`.
- MCP: use only the v2 packages `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/client`.
  Never import `@modelcontextprotocol/sdk` (that is v1).
- When unsure about an external API, read its `.d.ts` / `.d.mts` files under `node_modules` instead of guessing.
- Server code must type-check under `server/tsconfig.json` (strict). Add vitest tests next to new server code (`*.test.ts`).
- Tests must not touch the network.
- Do NOT run `git commit`, `git push`, `git reset`, `git checkout` or any history-changing git command. Claude reviews and commits each phase.
- Do not start long-running servers and leave them running. If you start `npm run dev` to check something, stop it before you finish.

When you finish, all of these must pass:
```
npm run lint && npm run lint:server && npm test && npm run build
```
Then:
- Append a dated entry to `docs/HACKATHON_CHANGES.md` (what this phase added, in plain words).
- Append to `docs/FRICTION_LOG.md` anything that was hard: task, steps, expected vs actual, severity, workaround, suggestion.
- End your reply with a short summary: files changed, commands run and their results, anything left undone.

---
