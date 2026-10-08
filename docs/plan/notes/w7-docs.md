# W7 docs

The pitch now matches the code that is in this tree. Claims were checked against the server, the voice page, and `git diff --stat pre-window..HEAD`, not against the other notes alone.

## What changed

- `README.md`: Opens on the file, the read-back receipt, and the yes. Judged surfaces are `/alexa` and Claude Code. Alexa+ add-ons, Claude, and ChatGPT are a capability. ChatGPT and a live add-on were not run. Quick start opens `/alexa` on `127.0.0.1`. `npm run dev` binds loopback. Env table covers the passcode, the 32-character secrets, the redirect allowlist, `AGORA_PUBLIC_URL`, `AGORA_TRUST_PROXY`, and `AGORA_TIMEZONE`. The Aug 31–Oct 23 stat is the fresh diff at `fa7a9c0`: 288 files, 29768 insertions, 2318 deletions, 40 commits. The meter number is time to first audio, and that number is `TODO(measure)`.
- `docs/ARCHITECTURE.md`: Same client honesty, protocol dates, eleven tools plus optional `web_research`, `who` / `list` / `dueAt`, briefing memory line, two-fact recall, order refusal, approval retry, voice model cannot approve, lock-down, persisted refresh, card URI on the tool result, Household cast, run file at start.
- `docs/AWS.md`: Bedrock and Polly only with credentials. Preview failure does not create an approval. `ask_agora` is about 4 seconds for Alexa and 9 for the simulator client. Client timeout is 90 seconds with one retry. Preview and spoken summary are 20 seconds and no retries.
- `docs/DEPLOY.md`: Passcode required for `0.0.0.0`. New env rows for the redirect allowlist, trust proxy, dev-token override, and timezone. `QWEN_BASE_URL` and `QWEN_MODEL` are no longer listed as unread overrides.
- `docs/SUBMISSION.md`: Tagline and description match the three claims. New "Demo video" heading with `<VIDEO_URL>`. The "working tree" sentence is gone. Open Source says the window contribution is the household MCP work, the code is MIT, and `public/models/` is CC BY-NC and not needed for `/alexa`.
- `docs/DEMO_SCRIPT.md`: Opens on `/alexa`. Complaints are paraphrased. Sources stay in the README. Beats: who and the allergy, shopping list, briefing that says the allergy, plan plus an exact yes, office with Agora, Scout, Planner, and Keeper and the summary line, Claude Code recall. Under 2:55. Plan beat needs Bedrock. Without it the tool says planning is unavailable and shows no card.
- `docs/FEEDBACK.md`: Protocol dates, card-on-result, voice approval rule, and time-to-first-audio meter.
- `docs/HACKATHON_CHANGES.md`: One 2026-10-08 fix-wave entry from the five notes, checked against the code.
- `docs/FRICTION_LOG.md`: One row per friction item in those notes, same columns as the existing table.
- `skills/agora-household/SKILL.md`, `references/TOOLS.md`, `references/ALEXA_ADDON.md`: `who`, `list`, `dueAt`, two-fact recall, order refusal, exact yes/no, retry, redirect allowlist, account linking, 4 second Alexa budget.
- `alexa-addon/README.md`: Account linking is on in the file. URLs are still `<host>`. Redirects are an exact server allowlist.

## Finding IDs closed

JDG-3, JDG-5, JDG-6, JDG-8, VOC-1, VOC-6, VOC-7, CMP-1, CMP-4, CMP-5, SPEC-8.

JDG-1 and JDG-2 stay open. There is no public video URL and the repo fields are still placeholders.

## Contracts

Documented, not implemented here. The code already has them:

1. Optional `who`, `list`, and `dueAt` on the stores and on `GET /api/household` objects. REST create bodies still omit them.
2. A household run file is `running` at the start and written again at the end. `recentRuns` is newest first with `id`, `status`, `startedAt`, and `spokenSummary` when set. `society-complete` carries `spokenSummary`.
3. The voice simulator does not let the model call `approve_action`. Exact yes/no or a button. `approve_action` stays an MCP tool. The SSE `final` event includes `runId` when that turn started a run.
4. `approvalDecision()` is the whole-phrase yes/no. "yes but not Tuesday" and "yesterday" are null.
5. An open task with `dueAt` in the past is due. The open simulator polls about every 30 seconds and speaks "Reminder: <title>." once per task per page load.
6. After a yes, the simulator speaks `spokenSummary` once when a run that started at or after that moment leaves `running`.

## Needs from others

- `.env.example` does not list `AGORA_TIMEZONE`. The server reads it (`server/household/clock.ts`). W2 owns that file.
- `POST /api/memory` and `POST /api/tasks` in `server/routes.ts` do not pass `who`, `list`, or `dueAt`. A leading name still stores `who` on a fact.
- A join snapshot still omits `spokenSummary` (`server/relay.ts`, `server/roomState.ts`). The panel can show it on `society-complete`. Someone who joins later does not get the line from the snapshot.
- JDG-1 and JDG-2 need a public video URL and real Open Source fields. Those are the user's.
- Replacing `<host>` and running `alexa-ai deploy` is the user.
- The SSRF pin is still not on the society model fetch or the Jina reader. Not a docs file.

## Friction

- Task: cite the current MCP spec from this tree. Expected: the version string in `node_modules`. Actual: a search of `@modelcontextprotocol` for `2026-07-28` found no match. The hashed files named in `docs/council/reports/g4-spec-followup.md` are not the names on disk now. Workaround: the docs cite that report for 2026-07-28 and for Alexa's `2025-03-26` sample, and cite `server/mcp/mcp.test.ts` for "2025-11-25 or newer."

## Left undone

- `<VIDEO_URL>`, `<REPO_URL>`, `<CONTRIBUTION_URL>`, and `<GITHUB_USERNAME>` are still placeholders.
- Time to first audio, a live Bedrock call, and a successful Polly synthesize are `TODO(measure)`.
- Screenshots still to capture: household panel, office household run, MCP Inspector, Claude Code recall.
- No calendar and no countdown. The script says so. It does not demo a timer.
