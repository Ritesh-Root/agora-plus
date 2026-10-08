# Phase 5b (stretch): MCP Apps — an interactive household card for screens

Goal: Alexa+ supports the MCP Apps extension, which renders a tool's interactive UI inside the conversation view (Echo
Show, the Alexa app). Give AGORA+ one such card: the household plan / briefing card. Other MCP Apps hosts (Claude,
ChatGPT) render it too. This is the first thing to cut if it fights the SDK.

## Package
`npm install @modelcontextprotocol/ext-apps@^2` (must be the 2.x line that works with the v2 `@modelcontextprotocol/server`).
Read `node_modules/@modelcontextprotocol/ext-apps/dist/**/*.d.ts` first. Docs:
https://apps.extensions.modelcontextprotocol.io/api/ and the quickstart linked from it.

Server side (from the docs): `registerAppResource`, `registerAppTool`, `RESOURCE_MIME_TYPE` from
`@modelcontextprotocol/ext-apps/server`; a tool links to its UI with `_meta: { ui: { resourceUri } }`; resources use
`ui://<tool>/<file>.html`. View side: `App` from `@modelcontextprotocol/ext-apps` (`new App({ name, version })`,
set `ontoolresult` before `app.connect()`, `app.callServerTool({ name, arguments })`).

## Build
1. `server/mcp/apps/householdCard.html` — one self-contained HTML file (inline CSS and JS, no CDN, no external fonts;
   hosts sandbox the iframe). It shows: the briefing items, open tasks with a "Done" button (calls `complete_task`),
   and pending approvals with Approve / Decline (calls `approve_action`). Uses the host's light/dark style when the host
   provides theme info, otherwise AGORA's palette. Readable at Echo Show sizes (large tap targets, ≥ 18 px text).
   The view script must be bundled into the HTML at build time if it imports `@modelcontextprotocol/ext-apps`
   (use esbuild, already installed, from a small `server/mcp/apps/householdCard.ts` entry; generate the HTML into
   `server/mcp/apps/dist/` during `npm run build` and also lazily on first request in dev). Keep the bundle small.
2. Register in `server/mcp/server.ts`: the UI resource `ui://daily_briefing/household-card.html` and link it from
   `daily_briefing` (and `list_tasks`) via `_meta.ui.resourceUri`. Tool behavior and text output stay exactly the same,
   so voice-only hosts are unaffected.
3. Production: make sure the generated HTML is available to `dist/server.mjs` (copy into `dist/` or embed as a string at
   build time) — verify with the Phase 5 bundle smoke test plus `resources/read` of the ui:// URI.

## Tests
- `resources/list` includes the ui:// resource with the MCP App mime type; `resources/read` returns HTML containing the
  view script; `tools/list` shows `_meta.ui.resourceUri` on `daily_briefing`.

## Acceptance
- The full gate passes, the Phase 5 production smoke test still passes.
- Optional manual check: open the card in the MCP Inspector web UI or another MCP Apps host if one is available, and
  note the result in `docs/HACKATHON_CHANGES.md`.
