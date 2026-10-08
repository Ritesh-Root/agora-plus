# Your task: Reliability and test reviewer (prefix TST)
Write your report to `docs/council/reports/q3-reliability-tests.md`.
You may run `npm test`, `npm run lint`, `npm run lint:server` and `npx vitest run <file>`, at most 3 full `npm test` runs
(to spot flaky tests). Do not run build, e2e or dev servers. Do not change any test or source file.

Scope: all `*.test.ts` files, `e2e/` (read only), and the server code they cover: `server/household/*`, `server/mcp/*`,
`server/llm/*`, `server/alexaSim/*`, `server/runEngine.ts`, `server/routes.ts`, `server/research/*`.

Check at least:
1. Map what is tested against what exists: each MCP tool, each REST route, each OAuth grant and error branch, bridge SSE event
   types, fast-path rules, tool-loop limits and ordering, Bedrock message mapping, Polly fallback, speech trimming, approvals expiry.
   Produce a table: behaviour, tested? (file:line), risk if broken. Rank the untested ones by demo risk.
2. Test quality: tests that cannot fail, assertions on mocks instead of behaviour, real timers or ports that make tests flaky,
   shared `AGORA_DATA_DIR` between tests, order dependence, network access hidden in tests.
3. Failure modes in the code (with evidence): Bedrock timeout or throttling, Polly 503, no Firecrawl key, corrupt or half-written
   JSON file in `.agora-data`, disk full, approval expiring mid-flow, process restart during a run, two runs requested at once,
   SSE client disconnecting (is upstream work aborted?), unhandled promise rejections, timers or listeners never cleared.
4. For the 3 most likely ways the live demo breaks (see `docs/DEMO_SCRIPT.md`), say exactly what the user would see and how to guard it.
5. Report the exact output summary of each command you ran (pass/fail counts, duration).
