# Your task: Spec follow-up (prefix SPEC)
Write your report to `docs/council/reports/g4-spec-followup.md`. Read files, use read-only git, and the web via Cloudflare only.
You may also run `npm view @modelcontextprotocol/server versions --json` and `npm view @modelcontextprotocol/ext-apps version`.

The judge member (`docs/council/reports/g3-judge-spec.md`) got HTTP 429 from Cloudflare and could not read the specs. Fetch them now.
You are the only web member running, but go slowly: one fetch at a time. If you get a 429, run `sleep 60` and try once more.
For documentation sites, prefer `start_crawl` with `render: false` and a small `limit` (it does not use browser time), then
`get_crawl_result`; use `get_url_markdown` for single pages.

1. MCP specification (modelcontextprotocol.io): which version is current today, and what changed between 2025-11-25 and the
   current version that matters for a stateless Streamable HTTP server with OAuth (required features, deprecations, auth,
   protocol-version negotiation). Then read `node_modules/@modelcontextprotocol/server` (and `core` if present) to find which
   protocol versions our installed SDK supports, and whether a newer SDK release exists.
2. MCP Apps extension: requirements for `ui://` resources, `_meta.ui.resourceUri`, MIME type, CSP and permissions, and how hosts
   render it. Compare with `server/mcp/apps/*` and the card registration in `server/mcp/server.ts`.
3. Alexa+ add-on docs on developer.amazon.com (MCP toolkit quickstart, authentication / account linking, tool design and latency
   guidance, the add-on manifest, testing and certification). Compare with `server/mcp/oauth.ts`, `server/mcp/http.ts`,
   `alexa-addon/addon.json` and `skills/agora-household/references/ALEXA_ADDON.md`. In particular: is an exact registered
   redirect-URI list required, which grant types and scopes Alexa+ uses, token lifetime limits, and any required tool annotations.
4. Findings = every requirement we do not meet or meet only partly, plus anything our docs claim that the specs contradict.
   Include a compliance table: requirement, URL, status (met / partly / not met), evidence in this repo.
