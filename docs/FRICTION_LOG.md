# Friction log

A running record of tools, APIs, and docs that slowed this hackathon build. Each phase adds a row when something was harder than it should have been. The table header stays fixed so later phases can append rows.

| Date | Tool/API | Task | Steps | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | TypeScript (`tsc`) | Phase 0a: five existing type errors | Ran `npm run lint` and `npm run lint:server` before editing | The session-end `!ended.ok` check would narrow `{ ok: true } \| { ok: false; error: string }`, and the orchestrator result type would only need `content` added beside an existing `usage` field | `lint:server` (strict) already narrowed `ended`. Root `npm run lint` has strict off, so it still rejected `.error`. The local `LLMLike` result declared only `content`; the tally parameter declared only optional `usage`, and TypeScript reported "no properties in common" | low | Cast the failure the same way `join` already does. Added optional `usage` next to `content` on the local result type | Enable `strict` on the root `tsconfig`, or stop the client project from typechecking `server/` through the Vite config import |
