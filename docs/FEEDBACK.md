# Product feedback

Written from this repository on 8 Oct 2026. Each note says what we actually did. Where a live call did not happen, the row says so. The longer log is [docs/FRICTION_LOG.md](FRICTION_LOG.md). Firecrawl's research-pass notes are the last rows of that log, copied from [docs/research/firecrawl-friction.md](research/firecrawl-friction.md).

## Alexa+ MCP toolkit docs

**Used for.** The OAuth shape in [server/mcp/oauth.ts](../server/mcp/oauth.ts), the empty 401, and the add-on manifest in [alexa-addon/addon.json](../alexa-addon/addon.json). The field layout came from the quickstart schema as recorded in the phase 5 friction row (page date Jul 10, 2026).

**What worked.** Discovery documents, client credentials with Basic auth, authorization code plus PKCE S256, and a 401 with no `WWW-Authenticate` header are specific enough to implement. The nested `addon.json` schema is specific once you ignore the flat sketch.

**What needs work.** The pages disagree with each other.

- The authentication page's runtime flow and its checklist disagree on the client-credentials scope. Step 5 says `mcp:tools`. The checklist says that grant may only issue `mcp:service`. This server issues `mcp:service` only. `tools/call` needs `mcp:tools` from the authorization-code grant or from `AGORA_MCP_TOKEN` ([docs/FRICTION_LOG.md](FRICTION_LOG.md)).
- The account-linking sample shows `401` with `{ "error": "unauthorized" }`. The quickstart says 401 without `WWW-Authenticate`. This server returns an empty body. A local production smoke test on port 8099 did that.
- The quickstart centers account linking. The authentication page also requires a client-credentials token for the service. An implementer has to read both and pick the checklist.
- Three protocol dates are in play. [server/mcp/mcp.test.ts](../server/mcp/mcp.test.ts) asserts the negotiated version is at least `2025-11-25`. Alexa's published client sample sends `2025-03-26`. The specification index on 8 Oct 2026 names 2026-07-28 as current ([docs/council/reports/g4-spec-followup.md](council/reports/g4-spec-followup.md)). The plan still records lifecycle samples on `2025-03-26` ([docs/plan/ROADMAP.md](plan/ROADMAP.md)).
- Alexa+ distribution in the manifest is `US` only ([alexa-addon/addon.json](../alexa-addon/addon.json)). A developer outside the US cannot finish a device test. `alexa-ai` was not installed or deployed here, so this is the documented limit, not a CLI error we hit.

**Onboarding.** The quickstart is the right length. It needs one manifest, one token command, and one protocol version, matching the pages a reviewer will open next.

**Build again?** Yes, once those three pages tell the same story. The protocol itself is the right way to put one household brain on Alexa+ and on other assistants.

## Alexa AI CLI

**Used for.** Reading only. The CLI reference dated Aug 18, 2026 and the account-linking page dated Jul 10, 2026 are summarized in [skills/agora-household/references/ALEXA_ADDON.md](../skills/agora-household/references/ALEXA_ADDON.md). `alexa-ai` was not installed, logged in, configured, deployed, or submitted ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)).

**What worked.** The docs name `alexa-ai new mcp`, `configure-account-linking`, and `deploy`. `alexa-ai new` has `--auth-client-id` and `--auth-scopes`.

**What needs work.** There is no single command that takes the token URL, client id, client secret, and scopes. The CLI reference shows `--config-file` and does not publish the JSON shape. The account-linking page shows flags and says Alexa discovers the token URL from `/.well-known/oauth-protected-resource`. `alexa-ai new` writes `addon-package/addon.json`, not a folder the quickstart sketch implies. Image URIs must be HTTPS, so a local package cannot validate until `<host>` is replaced.

**Onboarding.** Publish one config file and one command, in both documents, with a worked `addon.json`.

**Build again?** Not yet as a required step. We would run it after the config example exists and after a US account can deploy. The MCP server does not depend on the CLI.

## MCP TypeScript SDK v2

**Used for.** `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/node` 2.1.1, and `@modelcontextprotocol/client` 2.3.1. The server is `createMcpHandler(factory, { legacy: 'stateless' })` plus `toNodeHandler` ([server/mcp/http.ts](../server/mcp/http.ts)). Tests use `StreamableHTTPClientTransport` against an ephemeral server ([server/mcp/mcp.test.ts](../server/mcp/mcp.test.ts)). The screen card uses `@modelcontextprotocol/ext-apps` 2.0.3.

**What worked.** Stateless Streamable HTTP, a negotiated version of 2025-11-25 or newer, tool output schemas, resources, prompts, and the Apps `ui://` resource all landed in one server. `daily_briefing` and `list_tasks` now set the card URI on the tool result as well as the definition, and the server advertises `io.modelcontextprotocol/ui`. The official client accepts the stream our curl client had to parse by hand.

**What needs work.**

- `legacy: 'stateless'` still answers `initialize` as an SSE frame (`event: message` / `data: {...}`), which the v2 serving notes describe as a single JSON body unless the handler emits a notification ([docs/FRICTION_LOG.md](FRICTION_LOG.md)).
- The client's `authProvider` replaces `Authorization` after the caller sets it, and `token()` cannot see the JSON-RPC method. The voice bridge uses a custom `fetch` that reads the body and sets the header when the body contains `"tools/call"` ([server/alexaSim/bridge.ts](../server/alexaSim/bridge.ts)).
- Stateless legacy instances that never saw `initialize` hold no capability view, so the elicitation gates refuse (the `createMcpHandler` types say per-request instances that never saw an initialize hold nothing, so gates refuse there). A voice approval cannot pause inside one `tools/call`. We return `needs_approval` and an `approvalId`. On `/alexa` the person says an exact yes or no, or uses a button. The model is not given `approve_action`. External clients still call that tool ([server/household/approvals.ts](../server/household/approvals.ts)).
- `@modelcontextprotocol/ext-apps` pulled the MCP client and every Zod locale into the card. Aliasing the import to the package's `app-with-deps` browser file still left the HTML at about 416KB ([docs/FRICTION_LOG.md](FRICTION_LOG.md)).

**Onboarding.** The handler options are clear once you read the `legacy` union. Say in the serving page that stateless `initialize` is SSE, and show the two-call approval pattern next to elicitation.

**Build again?** Yes. v2 is what we would start from. We would not go back to `@modelcontextprotocol/sdk`.

## MCP Inspector

**Used for.** Not opened in the recorded phases. Phase 5b says the Inspector was not opened ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)). The same checks were done with `@modelcontextprotocol/client` in [server/mcp/mcp.test.ts](../server/mcp/mcp.test.ts) and with curl: 401 with an empty body, discovery, and `initialize` at `2025-11-25`.

**What worked.** We cannot score the Inspector UI from use.

**What needs work.** Anyone who does open it against this server needs to know that `initialize` comes back as an SSE event, and that a client-credentials token (`mcp:service`) can list tools and cannot call them. A development bearer (`AGORA_MCP_TOKEN`) can call them.

**Onboarding.** A stateless Streamable HTTP preset with a static bearer, showing the SSE `initialize` body as success, would match what Alexa+ and this server speak.

**Build again?** Yes, as the manual check, after a live session. It is not a substitute for the client test we already run.

## Agent Skills spec

**Used for.** [skills/agora-household/SKILL.md](../skills/agora-household/SKILL.md), checked by [server/skill.test.ts](../server/skill.test.ts) against the agentskills.io limits: `name` matches the directory, description at most 1024 characters, body under 500 lines. References hold the tool fields and the Alexa+ add-on steps so the skill itself stays short.

**What worked.** Frontmatter plus a markdown body is enough for connect, which tool, wait for yes, and speak two sentences. The test is small and catches a renamed folder.

**What needs work.** Nothing in the spec blocked us. The practical gap is elsewhere: a stateless MCP server cannot elicit, so the skill has to teach the second call. That belongs in the skill because the protocol will not do it inside one tool result.

**Onboarding.** The spec is short. A sample skill that calls an HTTP MCP server with a bearer header would have saved a pass through Claude Code's `mcp add` flags. We took those flags from the hackathon plan and wrote them into the skill.

**Build again?** Yes. Shipping the skill next to the server is how we want other agents to learn the approval rule.

## Amazon Bedrock (Claude Messages endpoint)

**Used for.** [server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts) calls `messages.create` on `AnthropicBedrockMantle`. Defaults are `anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5`. Office model names that do not start with `anthropic.` map to the default. Details and call counts are in [docs/AWS.md](AWS.md).

**What worked.** The Messages types match the tool loop: append-only history, a fixed system prompt, parallel tool results in one user message. Mapping stray model ids in one function kept the office swarm on Bedrock without editing the 3D office.

**What needs work.** Current Claude models on Bedrock are easy to point at the Converse API by mistake. `@anthropic-ai/bedrock-sdk` 0.34.3 depends on `@aws-sdk/client-bedrock-runtime`, which is the Converse client. The installed `MessageParam.role` also allows `system`, while the Bedrock Messages docs keep system as its own field. We import only `AnthropicBedrockMantle` and fold system-role turns into the system prompt ([docs/FRICTION_LOG.md](FRICTION_LOG.md)). Structured outputs are not available on this path, and `tool_choice` stays on `auto` ([docs/plan/ROADMAP.md](plan/ROADMAP.md)).

A live call was not made. The phase 3 shell had no AWS credentials.

**Onboarding.** One page that names these model ids, the action `bedrock-mantle:CreateInference`, and the Messages URL, and that says Converse is the older client, would match what we had to assemble from the SDK types and the roadmap.

**Build again?** Yes. The Messages endpoint is the Claude API we want on Bedrock. Split the Converse client out of the Mantle package so a Messages app does not download it.

## Amazon Polly

**Used for.** `POST /api/tts` in [server/alexaSim/tts.ts](../server/alexaSim/tts.ts). Neural voice Joanna by default, mp3, a cache of 100 clips, and a warm-up of the acknowledgement phrases. 503 lets the browser speak.

**What worked.** The fallback is the right shape for a demo machine with no credentials. The cache key (engine, voice, text) is enough. The voice page does not block the acknowledgement on Polly: the SSE `ack` event goes out first.

**What needs work.** With no credentials, TTS returned 503 `tts_unavailable` in about 2 seconds ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)). That delay is the failure path, not speech. A successful neural synthesize is `TODO(measure)`. The meter now records time to first audio only when playback starts, and says "text only" when it does not. Headless Chromium's `speechSynthesis` never fired `onstart` during the phase 4b pass ([docs/FRICTION_LOG.md](FRICTION_LOG.md)).

**Onboarding.** The API is small. Document the 503-plus-browser-fallback as a normal local path, and document that time to first audio needs a voice engine that actually starts.

**Build again?** Yes. Polly for the shipped voice, and browser speech for laptops that have not logged in, is what we would keep.

## Firecrawl

**Used for.** The customer-research pass on 8 Oct 2026 ([docs/research/alexa-plus-voice-of-customer.md](research/alexa-plus-voice-of-customer.md), [docs/research/sources.json](research/sources.json)). At runtime, `POST https://api.firecrawl.dev/v2/search` when `FIRECRAWL_API_KEY` is set, otherwise Exa ([server/research/firecrawl.ts](../server/research/firecrawl.ts)). The runtime client is unit-tested with a fake `fetch`. No live research key was required for the gate.

**What worked.** Wired, The Verge, Consumer Reports, Spyglass, Menlo, and Stack Overflow scraped. Search excerpts were enough to quote Reddit in complete sentences when the page itself was blocked. The source list is in `sources.json`.

**What needs work.** The eight rows at the bottom of [docs/FRICTION_LOG.md](FRICTION_LOG.md): Reddit, CNET, and Tom's Guide return "we do not support this site"; TechRadar came back as a newsletter wall; the App Store query model failed; PullPush rate-limited; an Algolia query with `OR` returned zero hits; direct-quote mode returned whole sections; a search snippet and a scrape disagreed on an Amazon update date.

**Onboarding.** The search and scrape tools are easy to call. Tell the caller which hosts are on the block list before the first research pass, and keep direct quotes under a sentence cap in the tool result.

**Build again?** Yes, for pages it can fetch. We would not use it as the only way to read Reddit, CNET, or Tom's Guide.

## Feature requests

### Critical

1. **One Alexa+ auth story.** Make the authentication checklist, the runtime-flow table, the account-linking sample, and the quickstart agree: which grant issues `mcp:service`, which grant issues `mcp:tools`, whether a 401 body is empty or `{ "error": "unauthorized" }`, and whether linking starts from the empty 401. Source: [docs/FRICTION_LOG.md](FRICTION_LOG.md).
2. **One Alexa AI CLI config.** One JSON example and one command for token URL, client id, client secret, and scopes, in both the CLI reference and the account-linking page. We could not run the CLI until that exists.
3. **A way for a non-US developer to complete an Alexa+ MCP add-on test.** The manifest allows `US` only. The research notes US general availability (CNBC, 4 Feb 2026, in [docs/research/alexa-plus-voice-of-customer.md](research/alexa-plus-voice-of-customer.md)).

### Important

4. **Name the three protocol dates in one place.** This server negotiates 2025-11-25 and newer. Alexa's published client sample sends 2025-03-26 ([docs/plan/ROADMAP.md](plan/ROADMAP.md) still records that sample). The specification index on 8 Oct 2026 names 2026-07-28.
5. **Document stateless approvals.** State that `legacy: 'stateless'` cannot elicit inside one tool call, and show `needs_approval` plus `approve_action` as the supported pattern. That is what [skills/agora-household/SKILL.md](../skills/agora-household/SKILL.md) has to teach by hand.
6. **Say which Claude models use the Messages endpoint.** Name the Mantle action `bedrock-mantle:CreateInference`, the model ids, and that Converse is the older client. The Mantle npm package should not depend on `@aws-sdk/client-bedrock-runtime`.
7. **Firecrawl: a block list and a short-quote mode.** Do not return a newsletter wall or a multi-paragraph extract as a direct quote. Do not retry Reddit, CNET, or Tom's Guide on the same key.

### Nice-to-have

8. **Serving docs: stateless `initialize` is still an SSE event.** Curl users and the Inspector should treat `event: message` as success.
9. **Let `authProvider.token()` see the JSON-RPC method,** or leave an `Authorization` header the caller already set.
10. **A browser build of `@modelcontextprotocol/ext-apps` that leaves out unused Zod locales.** The household card is about 416KB, almost all of it that file.
11. **Headless `speechSynthesis` should fire `onstart`.** The latency meter on `/alexa` is time to first audio. In headless Chromium it stays "text only" when `onstart` never fires.
12. **Prefer the scraped body over the search blurb** when they disagree on a date, and cap direct quotes at one sentence before they enter a quote bank.
