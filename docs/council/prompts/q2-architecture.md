# Your task: Architecture and maintainability reviewer (prefix ARC)
Write your report to `docs/council/reports/q2-architecture.md`. Read files and use read-only git only. Do not run npm commands.

Scope: everything added or changed during the hackathon window (`git diff --stat pre-window..HEAD -- server src shared`),
mainly `server/household/*`, `server/mcp/*`, `server/llm/*`, `server/alexaSim/*`, `server/runEngine.ts`, `server/hub.ts`,
`server/routes.ts`, `server/relay.ts`, `server/society/Orchestrator.ts`, `src/alexa/*`, `src/interface/HouseholdPanel.tsx`, `vite.config.ts`.

Check at least:
1. Is `server/household/actions.ts` really the single action layer? Find any logic duplicated between REST routes, MCP tools,
   the simulator fast path and the bridge (speech text, receipts, validation, approval handling).
2. Hot spots: the biggest files (`server/mcp/oauth.ts`, `server/mcp/server.ts`, `server/household/actions.ts`,
   `src/alexa/AlexaSimulator.tsx`, `server/runEngine.ts`). Long functions, deep nesting, mixed responsibilities. Suggest
   splits only where they clearly pay off before the deadline.
3. Type safety: `as` casts, `any`, non-null assertions, unchecked JSON parsing of files and request bodies, zod schemas that
   do not match what the code returns.
4. State and concurrency: read-modify-write races in the JSON store under concurrent MCP calls, in-memory state lost on restart
   (approvals, run status, OAuth codes), module-level singletons (`getHub()`), what happens with two server processes.
5. Configuration: list every `process.env.*` read in `server/` and `vite.config.ts`, and compare with `.env.example`,
   `docs/DEPLOY.md` and `docs/AWS.md`. Report variables that are read but not documented, or documented but never read.
6. Dead code and leftovers: unused exports, stubs left from earlier phases, TODOs, commented-out code, files nothing imports.
7. Docs drift: claims in `README.md`, `docs/ARCHITECTURE.md`, `docs/SUBMISSION.md`, `skills/agora-household/SKILL.md` and
   `skills/agora-household/references/TOOLS.md` that the code does not back up (tool names, arguments, behaviours, numbers).
8. Consistency of the tool contract: every MCP tool returns `speech` + `structuredContent {speech, status, receipt?, approvalId?}`
   that matches its `outputSchema`; status values used consistently.
