# Phase 0a: Baseline

Goal: make the quality gate green without changing behavior, and add the hackathon docs skeleton.

1. Fix exactly these five pre-existing type errors, with no behavior change:
   - `server/relay.ts` ~line 228: `attachRelay(server.httpServer)` — Vite types `httpServer` as `HttpServer | Http2SecureServer`.
     Cast to the Node `http.Server` that `attachRelay` takes (`server.httpServer as Server`, importing the type if needed).
   - `server/relay.ts` ~line 431: `.error` is read on `{ ok: true } | { ok: false; error: string }`.
     Narrow it the same way the `join` case in this file already does.
   - `server/society/Orchestrator.ts` ~lines 293, 371, 426: the file's local `LLMLike` result type only declares `usage`.
     Add `content: string | null` to that result type (and keep `usage` optional) so the calls type-check.
     Read the type first; do not change runtime code.
2. Add `.agora-data/` to `.gitignore`.
3. In `.env.example`, add these names with a one-line comment each and no real values:
   `AGORA_PUBLIC_URL`, `AGORA_DATA_DIR`, `AGORA_OAUTH_CLIENT_ID`, `AGORA_OAUTH_CLIENT_SECRET`, `AGORA_TOKEN_SECRET`,
   `AGORA_HOUSEHOLD_PASSCODE`, `AGORA_MCP_TOKEN`, `AGORA_SERVER_LLM`, `AWS_REGION`, `BEDROCK_MODEL`
   (default `anthropic.claude-sonnet-5`), `BEDROCK_FAST_MODEL` (default `anthropic.claude-haiku-4-5`),
   `POLLY_VOICE` (default `Joanna`), `POLLY_ENGINE` (default `neural`), `FIRECRAWL_API_KEY`.
   Keep the existing entries.
4. Create `docs/HACKATHON_CHANGES.md`:
   - Title "What changed during the hackathon window (Aug 31 – Oct 23, 2026)".
   - A "Before the window" line: baseline tag `pre-window` = commit `4f61371` (2026-08-20).
   - A section "Commits already in the window" listing the output of `git log --oneline pre-window..HEAD`.
   - A "Phase log" heading where each phase appends its entry. Add the Phase 0a entry.
5. Create `docs/FRICTION_LOG.md` with a short intro and a table header:
   `| Date | Tool/API | Task | Steps | Expected | Actual | Severity | Workaround | Suggestion |`.

Acceptance: `npm run lint && npm run lint:server && npm test && npm run build` all pass (lint and lint:server fail today).
